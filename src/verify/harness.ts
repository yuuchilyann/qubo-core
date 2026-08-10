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
 *
 * A match proves the recipe, not the transcription: the same `derive()` runs for
 * all eleven cases, so it cannot be right for eleven different reasons.
 */

import { ALL_CASES } from '../cases';
import { derive, checkFeasibility } from '../derive';
import { diffMatrices, evaluate } from '../qubo';
import { bruteForce } from '../samplers/bruteForce';
import { tabuSearch } from '../samplers/tabu';
import type { QuboCase } from '../types';

export type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

export type CaseReport = {
  id: string;
  section: string;
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

  return {
    id: qcase.id,
    section: qcase.section,
    n: model.n,
    checks,
    ok: checks.every((c) => c.ok),
  };
}

export function verifyAll(): CaseReport[] {
  return ALL_CASES.map(verifyCase);
}

/**
 * Sanity-check the heuristic against the exhaustive optimum on every case. Not a
 * correctness requirement — tabu search is allowed to miss — but a regression
 * guard on the incremental gain-vector bookkeeping.
 */
export function verifyTabuAgreement(): CheckResult[] {
  return ALL_CASES.map((qcase) => {
    const { model } = derive(qcase);
    const exact = bruteForce(model.Q, { sense: model.sense }).best[0].energy;
    const heur = tabuSearch(model.Q, { sense: model.sense, iterations: 4000 }).best[0]
      .energy;
    const match = exact === heur;
    return {
      name: `${qcase.section} tabu reaches optimum`,
      ok: match,
      detail: `exact=${exact} tabu=${heur}`,
    };
  });
}
