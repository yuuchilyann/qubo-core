/**
 * Checks for the Digital Annealer reproduction, run by `npm run verify:anneal`.
 *
 *   1. Every catalogue case: the best of the default runs reaches the
 *      exhaustive optimum, and the reported energy is `evaluate(Q, x)`.
 *   2. Same seed, same answer — the site promises reproducible runs.
 *   3. Parallel trial applies a flip at least as often as single trial on the
 *      same schedule. Aramon et al. (2019, §III) derive this: one step accepts
 *      if ANY of the n trials does.
 *   4. Precision: every case loads unchanged on both published register widths;
 *      `quantize` respects its limits on a deliberately non-integral Q.
 *
 * Check 1 is a regression guard like the tabu agreement, not a correctness
 * requirement — a heuristic may miss. The hit rates it prints are where the
 * numbers in docs/DIGITAL_ANNEALER.md come from.
 */

import { CATALOG } from '../cases';
import { derive } from '../derive';
import { evaluate } from '../qubo';
import { bruteForce } from '../samplers/bruteForce';
import { digitalAnnealer } from '../samplers/digitalAnnealer';
import {
  DA_FIRST_GENERATION,
  DA_THIRD_GENERATION,
  precisionReport,
  quantize,
  registerLimit,
} from '../hardware/daPrecision';
import type { CheckResult } from './harness';

export type AnnealRow = {
  section: string;
  id: string;
  n: number;
  optimum: number;
  parallelHits: number;
  singleHits: number;
  runs: number;
  parallelAcceptance: number;
  singleAcceptance: number;
  linearBits: number;
  quadraticBits: number;
  check: CheckResult;
};

const RUNS = 32;

export function verifyAnnealCases(): AnnealRow[] {
  return CATALOG.map((qcase) => {
    const { model } = derive(qcase);
    const optimum = bruteForce(model.Q, { sense: model.sense }).best[0].energy;
    const da = digitalAnnealer(model.Q, { sense: model.sense, runs: RUNS });
    const sa = digitalAnnealer(model.Q, { sense: model.sense, runs: RUNS, trial: 'single' });
    const hits = (r: typeof da) => r.runs.filter((run) => run.energy === optimum).length;
    const best = da.best[0];
    const consistent = best.energy === evaluate(model.Q, best.x);
    const prec = precisionReport(model.Q, DA_FIRST_GENERATION);
    return {
      section: qcase.section,
      id: qcase.id,
      n: model.n,
      optimum,
      parallelHits: hits(da),
      singleHits: hits(sa),
      runs: RUNS,
      parallelAcceptance: da.acceptanceRate,
      singleAcceptance: sa.acceptanceRate,
      linearBits: prec.linearBitsNeeded,
      quadraticBits: prec.quadraticBitsNeeded,
      check: {
        name: `${qcase.id} reaches optimum`,
        ok: best.energy === optimum && consistent,
        detail: `exact=${optimum} da=${best.energy}${consistent ? '' : ' (energy ≠ evaluate)'}`,
      },
    };
  });
}

export function verifyAnnealProperties(): CheckResult[] {
  const checks: CheckResult[] = [];
  const cases = CATALOG.map((c) => ({ id: c.id, model: derive(c).model }));

  // 2 — reproducibility
  const { model } = cases.find((c) => c.id === 'qap') ?? cases[0];
  const a = digitalAnnealer(model.Q, { sense: model.sense, seed: 7, trace: true });
  const b = digitalAnnealer(model.Q, { sense: model.sense, seed: 7, trace: true });
  const same =
    JSON.stringify(a.runs) === JSON.stringify(b.runs) &&
    JSON.stringify(a.trace) === JSON.stringify(b.trace);
  checks.push({ name: 'same seed, same runs and trace', ok: same, detail: `${a.runs.length} runs` });

  // 3 — parallel trial accepts at least as often
  const worse = cases.filter(({ model: m }) => {
    const p = digitalAnnealer(m.Q, { sense: m.sense, runs: 4 });
    const s = digitalAnnealer(m.Q, { sense: m.sense, runs: 4, trial: 'single' });
    return p.acceptanceRate < s.acceptanceRate;
  });
  checks.push({
    name: 'parallel-trial acceptance ≥ single-trial',
    ok: worse.length === 0,
    detail: worse.length ? `fails on ${worse.map((c) => c.id).join(', ')}` : `${cases.length} cases`,
  });

  // 4 — precision
  for (const target of [DA_FIRST_GENERATION, DA_THIRD_GENERATION]) {
    const misfits = cases.filter(({ model: m }) => !precisionReport(m.Q, target).fits);
    checks.push({
      name: `every case fits ${target.id} registers unchanged`,
      ok: misfits.length === 0,
      detail: misfits.length
        ? misfits.map((c) => c.id).join(', ')
        : `${target.linearBits}-bit linear, ${target.quadraticBits}-bit quadratic`,
    });
  }
  const unchanged = cases.every(({ model: m }) => {
    const qz = quantize(m.Q, DA_FIRST_GENERATION);
    return qz.scale === 1 && qz.rounded === 0 && JSON.stringify(qz.Q) === JSON.stringify(m.Q);
  });
  checks.push({ name: 'quantize leaves a fitting Q untouched', ok: unchanged, detail: 'scale 1, nothing rounded' });

  const odd = [
    [0.3, -1.7, 0.05],
    [-1.7, 2.25, 0.6],
    [0.05, 0.6, -0.9],
  ];
  const tiny = { id: 'tiny', linearBits: 6, quadraticBits: 4 };
  const qz = quantize(odd, tiny);
  const rep = precisionReport(qz.Q, tiny);
  checks.push({
    name: 'quantize lands inside the registers',
    ok: rep.fits,
    detail: `scale ${qz.scale.toFixed(3)}, max |h|=${rep.maxLinear} ≤ ${registerLimit(6)}, max |J|=${rep.maxQuadratic} ≤ ${registerLimit(4)}`,
  });

  return checks;
}
