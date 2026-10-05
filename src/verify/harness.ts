/**
 * Reconciliation harness — the project's truth source.
 *
 * For every case it asserts that the GENERAL derivation engine reproduces what
 * the paper printed:
 *
 *   1. `derive(case).Q` equals `case.paperQ` cell for cell
 *   2. the additive constant equals `case.paperConstant`
 *   3. exhaustive search finds `case.paperSolution.yQubo`
 *   4. the paper's own reported assignment attains that value
 *   5. `yOriginal = yQubo + constant` holds
 *   6. the paper's assignment satisfies every ORIGINAL constraint
 *   7. exhaustive search of the ORIGINAL model, without any QUBO, finds the
 *      paper's original objective value
 *
 * A match proves the recipe, not the transcription: the same `derive()` runs for
 * all eleven cases, so it cannot be right for eleven different reasons.
 *
 * A mentioned case (`ExtendedCase`) has no published Q, so checks 1–6 have
 * nothing to compare against. It is held to check 7 instead, strengthened: the
 * QUBO optimum must reproduce the constrained optimum, every QUBO optimum must
 * be feasible, and the two must agree on how many optima there are. See
 * `verifyExtended`.
 */

import { CATALOG } from '../cases';
import { solveConstrained } from '../constrained';
import { derive, checkFeasibility } from '../derive';
import { diffMatrices, evaluate } from '../qubo';
import { bruteForce } from '../samplers/bruteForce';
import { tabuSearch } from '../samplers/tabu';
import type { CatalogCase, ExtendedCase, QuboCase } from '../types';

export type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

export type CaseReport = {
  id: string;
  section: string;
  source: CatalogCase['source'];
  n: number;
  checks: CheckResult[];
  ok: boolean;
};

export function verifyCase(qcase: QuboCase): CaseReport {
  const checks: CheckResult[] = [];
  const { model } = derive(qcase);

  // 1 — Q matrix
  const dim = diffMatrices(model.Q, qcase.paperQ);
  checks.push({
    name: 'derived Q == paper Q',
    ok: dim.equal,
    detail: dim.equal
      ? `${model.n}×${model.n}`
      : dim.cells
          .slice(0, 6)
          .map((c) => `Q[${c.i}][${c.j}] derived=${c.a} paper=${c.b}`)
          .join('; ') + (dim.cells.length > 6 ? ` …(+${dim.cells.length - 6})` : ''),
  });

  // 2 — additive constant
  checks.push({
    name: 'constant == paper constant',
    ok: model.constant === qcase.paperConstant,
    detail: `derived=${model.constant} paper=${qcase.paperConstant}`,
  });

  // 3 — the paper's assignment attains the reported QUBO value
  const paperX = qcase.paperSolution.x;
  const atPaperX = evaluate(model.Q, paperX);
  checks.push({
    name: "paper's x attains paper's y",
    ok: atPaperX === qcase.paperSolution.yQubo,
    detail: `xᵀQx=${atPaperX} paper=${qcase.paperSolution.yQubo}`,
  });

  // 4 — the constant reconciles the two reported objective values
  checks.push({
    name: 'yOriginal == yQubo + constant',
    ok:
      qcase.paperSolution.yQubo + qcase.paperConstant === qcase.paperSolution.yOriginal,
    detail: `${qcase.paperSolution.yQubo} + ${qcase.paperConstant} = ${
      qcase.paperSolution.yQubo + qcase.paperConstant
    } (paper says ${qcase.paperSolution.yOriginal})`,
  });

  // 5 — exhaustive search agrees the paper's answer is optimal
  const result = bruteForce(model.Q, { sense: model.sense });
  const found = result.best[0].energy;
  checks.push({
    name: 'exhaustive optimum == paper y',
    ok: found === qcase.paperSolution.yQubo,
    detail: `found=${found} paper=${qcase.paperSolution.yQubo} (degeneracy ${result.degeneracy}, ${result.evaluated} evaluated in ${result.elapsedMs}ms)`,
  });

  // 6 — feasibility of the paper's assignment against the ORIGINAL model
  if (model.constant !== 0 || qcase.model.constraints.length > 0) {
    const feas = checkFeasibility(qcase.model, paperX);
    checks.push({
      name: "paper's x is feasible in the original model",
      ok: feas.feasible,
      detail: feas.feasible
        ? `${feas.rows.length} constraint(s) satisfied`
        : feas.rows
            .filter((r) => !r.ok)
            .map((r) => `row ${r.index + 1}: lhs=${r.lhs}`)
            .join('; '),
    });
  }

  // 7 — the original model, searched directly, agrees with the paper. Shares
  // nothing with `derive()`, so it would catch a recipe that is wrong in the
  // same way everywhere. Holds for §3.1 only because its instance has a perfect
  // split: the balance row is encoded as a hard equality.
  const direct = solveConstrained(qcase.model);
  checks.push({
    name: 'constrained search == paper original y',
    ok: direct.best === qcase.paperSolution.yOriginal,
    detail: `constrained=${direct.best} paper=${qcase.paperSolution.yOriginal} (${direct.feasibleCount}/${direct.evaluated} feasible)`,
  });

  return {
    id: qcase.id,
    section: qcase.section,
    source: qcase.source,
    n: model.n,
    checks,
    ok: checks.every((c) => c.ok),
  };
}

/**
 * Verification for a case the paper names but never works.
 *
 * The reference is `solveConstrained`, which enumerates the original model with
 * no penalties and no slack, so agreement is not `derive()` agreeing with itself.
 */
export function verifyExtended(qcase: ExtendedCase): CaseReport {
  const checks: CheckResult[] = [];
  const { model } = derive(qcase);
  const direct = solveConstrained(qcase.model);

  // A — the instance has an answer at all
  checks.push({
    name: 'original model is feasible',
    ok: direct.best !== null,
    detail: `${direct.feasibleCount}/${direct.evaluated} assignments feasible`,
  });

  // B — the QUBO optimum, with its constant restored, is the constrained optimum
  const keep = Math.max(8, direct.argmins.length);
  const result = bruteForce(model.Q, { sense: model.sense, keep });
  const found = result.best[0].energy;
  checks.push({
    name: 'QUBO optimum + constant == constrained optimum',
    ok: direct.best !== null && found + model.constant === direct.best,
    detail: `${found} + ${model.constant} = ${found + model.constant}, constrained=${direct.best}`,
  });

  // C — the penalty is large enough: no infeasible assignment ties the optimum
  const infeasible = result.best.filter((b) => !checkFeasibility(qcase.model, b.x).feasible);
  checks.push({
    name: 'every QUBO optimum is feasible',
    ok: result.degeneracy <= keep && infeasible.length === 0,
    detail:
      result.degeneracy > keep
        ? `degeneracy ${result.degeneracy} exceeds the ${keep} retained`
        : `${result.best.length} optimum/optima, ${infeasible.length} infeasible`,
  });

  // D — same number of optima. Only meaningful without slack, where QUBO
  // assignments and original assignments correspond one to one.
  if (model.n === qcase.model.numVars) {
    checks.push({
      name: 'QUBO degeneracy == constrained degeneracy',
      ok: result.degeneracy === direct.argmins.length,
      detail: `qubo=${result.degeneracy} constrained=${direct.argmins.length}`,
    });
  }

  // E — a value the paper implies, where there is one
  if (qcase.anchor) {
    checks.push({
      name: 'constrained optimum == value the paper implies',
      ok: direct.best === qcase.anchor.yOriginal,
      detail: `constrained=${direct.best} implied=${qcase.anchor.yOriginal}: ${qcase.anchor.via}`,
    });
  }

  return {
    id: qcase.id,
    section: qcase.section,
    source: qcase.source,
    n: model.n,
    checks,
    ok: checks.every((c) => c.ok),
  };
}

export function verifyAll(): CaseReport[] {
  return CATALOG.map((c) => (c.source === 'worked' ? verifyCase(c) : verifyExtended(c)));
}

/**
 * Sanity-check the heuristic against the exhaustive optimum on every case. Not a
 * correctness requirement — tabu search is allowed to miss — but a regression
 * guard on the incremental gain-vector bookkeeping.
 */
export function verifyTabuAgreement(): CheckResult[] {
  return CATALOG.map((qcase) => {
    const { model } = derive(qcase);
    const exact = bruteForce(model.Q, { sense: model.sense }).best[0].energy;
    const heur = tabuSearch(model.Q, { sense: model.sense, iterations: 4000 }).best[0]
      .energy;
    const match = exact === heur;
    return {
      name: `${qcase.source === 'worked' ? qcase.section : qcase.id} tabu reaches optimum`,
      ok: match,
      detail: `exact=${exact} tabu=${heur}`,
    };
  });
}
