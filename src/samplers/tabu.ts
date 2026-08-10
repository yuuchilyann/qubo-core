/**
 * Tabu search for QUBO — the classical method this paper's own authors built
 * their careers on (Glover 1996/1997; adapted to QUBO in Wang et al. 2012/2013,
 * and the engine behind the Alpha-QUBO solver cited in §6).
 *
 * The efficiency trick is the same one the exhaustive solver uses: maintain the
 * per-bit gain vector
 *
 * ```
 * g_k = q_kk + 2·Σ_{j≠k} q_kj·x_j          Δ_k = (1 − 2x_k)·g_k
 * ```
 *
 * incrementally. Flipping bit `m` shifts every other `g_k` by `2·q_km·Δx_m`, so
 * both choosing a move and applying it cost `O(n)` — putting problems with
 * hundreds of variables comfortably inside an interactive budget.
 *
 * This is a HEURISTIC. It reports the best assignment it found, never a proof of
 * optimality, and the UI must label its results accordingly.
 */

import { HISTOGRAM_BINS } from '../types';
import type { SampleSet, Sense } from '../types';
import { evaluate } from '../qubo';

export type TabuOptions = {
  sense: Sense;
  /** Total moves across all restarts. */
  iterations?: number;
  /**
   * How long a flipped bit stays forbidden. Both extremes fail:
   * a tenure at or above `n` saturates the list so every move is tabu, while a
   * very short one lets the trajectory fall into a short limit cycle.
   */
  tenure?: number;
  /**
   * Moves without improving the current descent's best before the search
   * re-seeds. Without this, a cycling trajectory burns the whole budget
   * revisiting a handful of states.
   */
  stagnationLimit?: number;
  /** Deterministic seed so runs are reproducible for teaching. */
  seed?: number;
  onProgress?: (fraction: number) => boolean | void;
};

/** Small deterministic PRNG (mulberry32) — reproducibility beats cryptographic quality here. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tabuSearch(
  Q: number[][],
  {
    sense,
    iterations = 20000,
    tenure,
    stagnationLimit,
    seed = 0x5eed,
    onProgress,
  }: TabuOptions,
): SampleSet {
  const started = Date.now();
  const n = Q.length;
  const rand = rng(seed);
  // Roughly n/2, clamped so it can neither saturate the list nor collapse to a
  // near-zero tenure that cycles.
  const T = tenure ?? Math.max(1, Math.min(Math.floor(n / 2), 20, Math.max(1, n - 2)));
  const STAGNATION = stagnationLimit ?? Math.max(30, 3 * n);
  // Work internally as a minimisation; flip the sign for `max`.
  const s = sense === 'min' ? 1 : -1;

  const q = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) q[i * n + j] = s * Q[i][j];

  let globalBest = Infinity;
  let globalX = new Uint8Array(n);
  let evaluated = 0;

  const x = new Uint8Array(n);
  const g = new Float64Array(n);
  const tabuUntil = new Int32Array(n);
  const energies: number[] = [];

  let energy = 0;
  let localBest = Infinity;
  let stagnant = 0;

  /** Random restart: re-seed x, then rebuild the gain vector and energy from scratch. */
  const reseed = () => {
    for (let i = 0; i < n; i++) x[i] = rand() < 0.5 ? 1 : 0;
    tabuUntil.fill(-1);
    for (let k = 0; k < n; k++) {
      let acc = q[k * n + k];
      for (let j = 0; j < n; j++) if (j !== k && x[j]) acc += 2 * q[k * n + j];
      g[k] = acc;
    }
    energy = 0;
    for (let i = 0; i < n; i++) {
      if (!x[i]) continue;
      energy += q[i * n + i];
      for (let j = i + 1; j < n; j++) if (x[j]) energy += 2 * q[i * n + j];
    }
    localBest = energy;
    stagnant = 0;
    if (energy < globalBest) {
      globalBest = energy;
      globalX = Uint8Array.from(x);
    }
  };

  reseed();

  for (let it = 0; it < iterations; it++) {
    let pick = -1;
    let pickDelta = Infinity;
    let pickTies = 0;
    // Fallback so a fully-tabu neighbourhood degrades to "least bad move"
    // rather than abandoning the restart.
    let anyPick = -1;
    let anyDelta = Infinity;
    let anyTies = 0;

    for (let k = 0; k < n; k++) {
      const delta = x[k] ? -g[k] : g[k];

      // Reservoir sampling over ties. Deterministic tie-breaking makes the
      // trajectory periodic, and the search then orbits a limit cycle
      // forever — visibly so on the small cases, where 24,000 evaluations
      // could still miss the optimum of a 64-state space.
      if (delta < anyDelta) {
        anyDelta = delta;
        anyPick = k;
        anyTies = 1;
      } else if (delta === anyDelta && rand() < 1 / ++anyTies) {
        anyPick = k;
      }

      const isTabu = tabuUntil[k] > it;
      // Aspiration: a tabu move is allowed if it beats the best seen so far.
      if (isTabu && energy + delta >= localBest) continue;
      if (delta < pickDelta) {
        pickDelta = delta;
        pick = k;
        pickTies = 1;
      } else if (delta === pickDelta && rand() < 1 / ++pickTies) {
        pick = k;
      }
    }
    if (pick < 0) {
      if (anyPick < 0) break;
      pick = anyPick;
      pickDelta = anyDelta;
    }

    const dx = x[pick] ? -1 : 1;
    x[pick] = x[pick] ? 0 : 1;
    energy += pickDelta;
    evaluated += n;

    // Only x[pick] moved, so every other gain shifts by 2·q[k][pick]·dx.
    for (let k = 0; k < n; k++) if (k !== pick) g[k] += 2 * q[k * n + pick] * dx;

    // Jitter the tenure too — a constant tenure is itself a source of periodicity.
    tabuUntil[pick] = it + 1 + Math.floor(rand() * T);
    if (energies.length < 4096) energies.push(s * energy);

    if (energy < localBest) {
      localBest = energy;
      stagnant = 0;
    } else {
      stagnant++;
    }
    if (energy < globalBest) {
      globalBest = energy;
      globalX = Uint8Array.from(x);
    }

    // Diversify. A trajectory that stops improving is almost always orbiting
    // a small cycle; re-seeding converts the remaining budget from wasted
    // revisits into fresh coverage.
    if (stagnant >= STAGNATION) reseed();

    if (onProgress && (it & 1023) === 0) {
      if (onProgress(it / iterations) === false) break;
    }
  }

  const bestArr = Array.from(globalX);
  const lo = energies.length ? Math.min(...energies) : 0;
  const hi = energies.length ? Math.max(...energies) : 0;
  const span = hi - lo || 1;
  const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
  for (const e of energies) {
    bins[Math.min(HISTOGRAM_BINS - 1, Math.floor(((e - lo) / span) * HISTOGRAM_BINS))]++;
  }

  return {
    best: [{ x: bestArr, energy: evaluate(Q, bestArr) }],
    degeneracy: 1,
    quality: 'heuristic',
    histogram: { min: lo, max: hi, bins },
    evaluated,
    elapsedMs: Date.now() - started,
  };
}
