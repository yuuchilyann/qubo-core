/**
 * Exhaustive QUBO solver.
 *
 * Enumerates the 2ⁿ assignments in **Gray-code order** so consecutive candidates
 * differ in exactly one bit. Flipping bit `k` changes the objective by
 *
 * ```
 * Δ = ± g_k     where     g_k = q_kk + 2·Σ_{j≠k} q_kj·x_j
 * ```
 *
 * `g_k` does not depend on `x_k` itself, so each step costs `O(n)` instead of
 * the `O(n²)` a fresh `xᵀQx` would. Total work is `O(n·2ⁿ)`, which is what puts
 * the paper's fifteen-variable Graph Colouring case comfortably under a
 * millisecond and keeps roughly `n ≤ 24` interactive in a browser worker.
 */

import { HISTOGRAM_BINS } from '../types';
import type { SampleSet, Sense } from '../types';
import { evaluate } from '../qubo';

export type BruteForceOptions = {
  sense: Sense;
  /** How many top solutions to retain. */
  keep?: number;
  /** Invoked periodically with a 0–1 fraction; return `false` to abort. */
  onProgress?: (fraction: number) => boolean | void;
  /** Optional feasibility test against the ORIGINAL constraints. */
  isFeasible?: (x: Uint8Array) => boolean;
};

const PROGRESS_EVERY = 1 << 18;

/** Index of the lowest set bit — the bit Gray code flips at step `t`. */
function lowestSetBit(t: number): number {
  return 31 - Math.clz32(t & -t);
}

export function bruteForce(
  Q: number[][],
  { sense, keep = 8, onProgress, isFeasible }: BruteForceOptions,
): SampleSet {
  const started = Date.now();
  const n = Q.length;
  const total = 2 ** n;
  const better = sense === 'min' ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;

  // Flatten Q once — row lookups dominate the inner loop.
  const q = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) q[i * n + j] = Q[i][j];

  const x = new Uint8Array(n);
  let energy = 0;

  // Keeping every energy is only affordable at modest n (2²⁰ doubles = 8 MB).
  const storeAll = n <= 20;
  const all = storeAll ? new Float64Array(total) : null;

  let bestEnergy = 0;
  let degeneracy = 1;
  const bestX: number[][] = [[...x]];
  let lo = 0;
  let hi = 0;
  let feasibleCount = isFeasible ? (isFeasible(x) ? 1 : 0) : undefined;
  if (all) all[0] = 0;

  for (let t = 1; t < total; t++) {
    const k = lowestSetBit(t);

    // g_k = q_kk + 2·Σ_{j≠k} q_kj·x_j
    const base = k * n;
    let g = q[base + k];
    for (let j = 0; j < n; j++) {
      if (j !== k && x[j]) g += 2 * q[base + j];
    }

    if (x[k]) {
      energy -= g;
      x[k] = 0;
    } else {
      energy += g;
      x[k] = 1;
    }

    if (all) all[t] = energy;
    if (energy < lo) lo = energy;
    else if (energy > hi) hi = energy;

    if (better(energy, bestEnergy)) {
      bestEnergy = energy;
      degeneracy = 1;
      bestX.length = 0;
      bestX.push([...x]);
    } else if (energy === bestEnergy) {
      degeneracy++;
      if (bestX.length < keep) bestX.push([...x]);
    }

    if (isFeasible && feasibleCount !== undefined && isFeasible(x)) feasibleCount++;

    if (onProgress && (t & (PROGRESS_EVERY - 1)) === 0) {
      if (onProgress(t / total) === false) break;
    }
  }

  // Recompute the retained solutions from scratch: the incremental loop is exact
  // for integer and half-integer Q, but this costs nothing and removes any doubt.
  const best = bestX.map((v) => ({ x: v, energy: evaluate(Q, v) }));

  return {
    best,
    degeneracy,
    quality: 'exact',
    histogram: histogramOf(all, lo, hi, q, n, total, sense),
    feasibleCount,
    evaluated: total,
    elapsedMs: Date.now() - started,
  };
}

/**
 * Bin the energy distribution. When every energy was retained this is a cheap
 * pass over the stored array; otherwise a second Gray-code sweep re-derives them
 * without allocating.
 */
function histogramOf(
  all: Float64Array | null,
  lo: number,
  hi: number,
  q: Float64Array,
  n: number,
  total: number,
  _sense: Sense,
): SampleSet['histogram'] {
  const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
  const span = hi - lo || 1;
  const put = (e: number) => {
    const b = Math.min(HISTOGRAM_BINS - 1, Math.floor(((e - lo) / span) * HISTOGRAM_BINS));
    bins[b]++;
  };

  if (all) {
    for (let t = 0; t < total; t++) put(all[t]);
  } else {
    const x = new Uint8Array(n);
    let energy = 0;
    put(0);
    for (let t = 1; t < total; t++) {
      const k = lowestSetBit(t);
      const base = k * n;
      let g = q[base + k];
      for (let j = 0; j < n; j++) {
        if (j !== k && x[j]) g += 2 * q[base + j];
      }
      if (x[k]) {
        energy -= g;
        x[k] = 0;
      } else {
        energy += g;
        x[k] = 1;
      }
      put(energy);
    }
  }

  return { min: lo, max: hi, bins };
}
