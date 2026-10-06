/**
 * The Digital Annealer's algorithm, reproduced from its published description:
 * Aramon, Rosenberg, Valiante, Miyazawa, Tamura & Katzgraber, "Physics-Inspired
 * Optimization for Quadratic Unconstrained Problems Using a Digital Annealer",
 * Frontiers in Physics 7:48 (2019), Algorithm 2.
 *
 * It is simulated annealing with two changes:
 *
 *   1. **Parallel trial.** Every Monte Carlo step evaluates a flip of EVERY
 *      variable against the Metropolis criterion, then applies one of the
 *      accepted flips, chosen uniformly. Single-trial SA proposes one variable
 *      per step and usually rejects it.
 *   2. **Dynamic offset.** A step in which no flip is accepted raises an energy
 *      offset `E_off`, and every Δ is tested as `Δ − E_off`. The offset keeps
 *      rising until something is accepted, then resets to zero. It is how the
 *      algorithm climbs out of a local minimum without waiting on luck.
 *
 * What runs here is the ALGORITHM, not the hardware. Fujitsu's ASIC evaluates
 * the n trials in parallel and updates the n effective fields in constant time;
 * a CPU does the same work in O(n) per step. So this reproduces how the method
 * moves through the landscape — acceptance, escapes, the final answer — and
 * says nothing about how fast Fujitsu's machine is.
 *
 * The bookkeeping is the gain vector the other samplers share:
 *
 * ```
 * g_k = q_kk + 2·Σ_{j≠k} q_kj·x_j          Δ_k = (1 − 2x_k)·g_k
 * ```
 *
 * This is a HEURISTIC; like tabu search, it reports the best assignment it
 * found and never a proof of optimality.
 */

import { HISTOGRAM_BINS } from '../types';
import type { SampleSet, Sense } from '../types';
import { evaluate } from '../qubo';
import { rng } from '../random';

/**
 * `parallel` is the Digital Annealer. `single` is plain single-trial simulated
 * annealing on the same schedule and the same step budget, with no offset —
 * the baseline the paper compares it against.
 */
export type AnnealTrial = 'parallel' | 'single';

export type DigitalAnnealerOptions = {
  sense: Sense;
  trial?: AnnealTrial;
  /** Independent anneals from fresh random states ("runs" in the paper). */
  runs?: number;
  /** Monte Carlo sweeps per run; one sweep is n steps. */
  sweeps?: number;
  /**
   * Starting and final temperature. The defaults follow the usual rule for an
   * annealing schedule: hot enough that the largest possible uphill move is
   * accepted half the time, cold enough that the smallest is accepted 1% of
   * the time.
   */
  tStart?: number;
  tEnd?: number;
  /**
   * How much `E_off` rises after a step with no accepted flip. The paper treats
   * it as a tuned parameter; the default is the smallest nonzero |Δ|, so an
   * escape over a barrier of height h takes about h / that many steps.
   */
  offsetIncrease?: number;
  seed?: number;
  /** Record a downsampled trajectory of the first run, for the teaching view. */
  trace?: boolean;
  onProgress?: (fraction: number) => boolean | void;
};

/** One sample of the first run's trajectory. Energies are in the caller's sense. */
export type AnnealTracePoint = {
  step: number;
  temperature: number;
  energy: number;
  offset: number;
  /** Flips that passed the Metropolis test at this step (0 or 1 for single trial). */
  accepted: number;
};

export type AnnealRun = { x: number[]; energy: number };

export type DigitalAnnealerResult = SampleSet & {
  trial: AnnealTrial;
  /** Best state of every run, in run order — the raw material for a hit rate. */
  runs: AnnealRun[];
  /** Steps in which at least one flip was applied, over all steps. */
  acceptanceRate: number;
  /** Steps in which the offset had to rise. Always 0 for single trial. */
  offsetSteps: number;
  schedule: { tStart: number; tEnd: number; offsetIncrease: number; sweeps: number };
  trace?: AnnealTracePoint[];
};

/** Most trace points kept, however long the run. */
const TRACE_POINTS = 600;

/**
 * The largest and smallest nonzero |Δ| a single flip can produce: bounds for
 * the default temperatures. Sign-free, so it serves `min` and `max` alike.
 */
export function deltaRange(Q: number[][]): { max: number; min: number } {
  const n = Q.length;
  let max = 0;
  let min = Infinity;
  for (let k = 0; k < n; k++) {
    let row = Math.abs(Q[k][k]);
    if (Q[k][k] !== 0) min = Math.min(min, Math.abs(Q[k][k]));
    for (let j = 0; j < n; j++) {
      if (j === k || Q[k][j] === 0) continue;
      row += 2 * Math.abs(Q[k][j]);
      min = Math.min(min, 2 * Math.abs(Q[k][j]));
    }
    max = Math.max(max, row);
  }
  if (!Number.isFinite(min)) min = 1;
  return { max: max || 1, min };
}

export function digitalAnnealer(
  Q: number[][],
  {
    sense,
    trial = 'parallel',
    runs = 16,
    sweeps = 200,
    tStart,
    tEnd,
    offsetIncrease,
    seed = 0x5eed,
    trace = false,
    onProgress,
  }: DigitalAnnealerOptions,
): DigitalAnnealerResult {
  const started = Date.now();
  const n = Q.length;
  const rand = rng(seed);
  // Work internally as a minimisation; flip the sign for `max`.
  const s = sense === 'min' ? 1 : -1;

  const range = deltaRange(Q);
  const T0 = tStart ?? range.max / Math.LN2;
  const T1 = tEnd ?? range.min / Math.log(100);
  const rise = offsetIncrease ?? range.min;

  const q = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) q[i * n + j] = s * Q[i][j];

  const steps = Math.max(1, sweeps * n);
  // Geometric cooling, updated every step: T(t) = T0·(T1/T0)^(t/(steps−1)).
  const cool = steps > 1 ? Math.pow(T1 / T0, 1 / (steps - 1)) : 1;

  const x = new Uint8Array(n);
  const g = new Float64Array(n);
  const candidates = new Int32Array(n);
  const results: AnnealRun[] = [];
  const energies: number[] = [];
  const points: AnnealTracePoint[] = [];
  const traceEvery = Math.max(1, Math.ceil(steps / TRACE_POINTS));

  let globalBest = Infinity;
  let globalX = new Uint8Array(n);
  let applied = 0;
  let offsetSteps = 0;
  let evaluated = 0;
  let aborted = false;

  for (let r = 0; r < runs && !aborted; r++) {
    for (let i = 0; i < n; i++) x[i] = rand() < 0.5 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      let acc = q[k * n + k];
      for (let j = 0; j < n; j++) if (j !== k && x[j]) acc += 2 * q[k * n + j];
      g[k] = acc;
    }
    let energy = 0;
    for (let i = 0; i < n; i++) {
      if (!x[i]) continue;
      energy += q[i * n + i];
      for (let j = i + 1; j < n; j++) if (x[j]) energy += 2 * q[i * n + j];
    }
    let runBest = energy;
    let runX = Uint8Array.from(x);
    let offset = 0;
    let T = T0;

    const flip = (m: number, delta: number) => {
      const dx = x[m] ? -1 : 1;
      x[m] = x[m] ? 0 : 1;
      energy += delta;
      for (let k = 0; k < n; k++) if (k !== m) g[k] += 2 * q[k * n + m] * dx;
      if (energy < runBest) {
        runBest = energy;
        runX = Uint8Array.from(x);
      }
    };
    // Metropolis on an (offset-lowered) Δ. Downhill moves skip the RNG call.
    const accepts = (d: number) => d <= 0 || rand() < Math.exp(-d / T);

    for (let t = 0; t < steps; t++) {
      let accepted = 0;
      if (trial === 'parallel') {
        for (let k = 0; k < n; k++) {
          const delta = x[k] ? -g[k] : g[k];
          if (accepts(delta - offset)) candidates[accepted++] = k;
        }
        evaluated += n;
        if (accepted > 0) {
          const m = candidates[Math.floor(rand() * accepted)];
          flip(m, x[m] ? -g[m] : g[m]);
          offset = 0;
          applied++;
        } else {
          offset += rise;
          offsetSteps++;
        }
      } else {
        const k = Math.floor(rand() * n);
        const delta = x[k] ? -g[k] : g[k];
        evaluated += 1;
        if (accepts(delta)) {
          accepted = 1;
          flip(k, delta);
          applied++;
        }
      }

      if (trace && r === 0 && (t % traceEvery === 0 || t === steps - 1)) {
        points.push({ step: t, temperature: T, energy: s * energy, offset, accepted });
      }
      if (r === 0 && energies.length < 4096 && t % Math.max(1, Math.floor(steps / 4096)) === 0) {
        energies.push(s * energy);
      }
      T *= cool;
    }

    results.push({ x: Array.from(runX), energy: evaluate(Q, Array.from(runX)) });
    if (runBest < globalBest) {
      globalBest = runBest;
      globalX = runX;
    }
    if (onProgress && onProgress((r + 1) / runs) === false) aborted = true;
  }

  const bestArr = Array.from(globalX);
  const bestEnergy = evaluate(Q, bestArr);
  const lo = energies.length ? Math.min(...energies) : 0;
  const hi = energies.length ? Math.max(...energies) : 0;
  const span = hi - lo || 1;
  const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
  for (const e of energies) {
    bins[Math.min(HISTOGRAM_BINS - 1, Math.floor(((e - lo) / span) * HISTOGRAM_BINS))]++;
  }
  const totalSteps = steps * results.length;

  return {
    best: [{ x: bestArr, energy: bestEnergy }],
    degeneracy: 1,
    quality: 'heuristic',
    histogram: { min: lo, max: hi, bins },
    evaluated,
    elapsedMs: Date.now() - started,
    trial,
    runs: results,
    acceptanceRate: totalSteps ? applied / totalSteps : 0,
    offsetSteps,
    schedule: { tStart: T0, tEnd: T1, offsetIncrease: rise, sweeps },
    trace: trace ? points : undefined,
  };
}
