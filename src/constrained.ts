/**
 * Exhaustive search over the ORIGINAL constrained model — no QUBO involved.
 *
 * This is the reference a case falls back on when the paper prints no answer.
 * It is useful precisely because it shares nothing with `derive()`: no
 * penalties, no slack bits, no symmetric split. It enumerates the 2^numVars
 * assignments of the decision variables, discards the infeasible ones, and
 * scores the rest with the objective exactly as the model states it.
 *
 * If the QUBO optimum plus its constant reproduces this optimum, the recasting
 * is correct for that instance AND the penalty was large enough. Neither half
 * can be shown by running `derive()` against its own output.
 */

import { checkFeasibility, unsatisfiedClauses } from './derive';
import type { ConstrainedModel } from './types';

/** Practical ceiling: 2²⁴ assignments is about the limit for a synchronous call. */
export const CONSTRAINED_LIMIT = 24;

/**
 * The original objective at `x`, mirroring what `deriveModel` puts into Q
 * before any penalty: the cut count when the model is §3.2's edge list,
 * otherwise the linear and quadratic terms, plus §4.3's unsatisfied clauses.
 */
export function objectiveValue(model: ConstrainedModel, x: number[] | Uint8Array): number {
  let y = 0;
  if (model.cutEdges) {
    for (const [i, j] of model.cutEdges) if (x[i] !== x[j]) y += 1;
  } else {
    model.linear.forEach((c, j) => (y += c * x[j]));
    for (const { i, j, coef } of model.quadratic) y += coef * x[i] * x[j];
  }
  if (model.clauses) y += unsatisfiedClauses(model.clauses, x);
  return y;
}

export type ConstrainedOptimum = {
  /** `null` when no assignment satisfies every constraint. */
  best: number | null;
  /** Every optimal assignment of the decision variables, in enumeration order. */
  argmins: number[][];
  feasibleCount: number;
  evaluated: number;
};

export function solveConstrained(model: ConstrainedModel): ConstrainedOptimum {
  const n = model.numVars;
  if (n > CONSTRAINED_LIMIT) {
    throw new Error(`solveConstrained: ${n} variables exceeds the limit of ${CONSTRAINED_LIMIT}`);
  }
  const better = model.sense === 'min' ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;
  const total = 2 ** n;
  const x = new Array<number>(n).fill(0);

  let best: number | null = null;
  let argmins: number[][] = [];
  let feasibleCount = 0;

  for (let mask = 0; mask < total; mask++) {
    for (let j = 0; j < n; j++) x[j] = (mask >>> j) & 1;
    if (!checkFeasibility(model, x).feasible) continue;
    feasibleCount++;
    const y = objectiveValue(model, x);
    if (best === null || better(y, best)) {
      best = y;
      argmins = [[...x]];
    } else if (y === best) {
      argmins.push([...x]);
    }
  }

  return { best, argmins, feasibleCount, evaluated: total };
}
