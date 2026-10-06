/**
 * Does a QUBO fit the Digital Annealer's integer registers?
 *
 * The hardware takes the polynomial
 *
 * ```
 * Σ_i h_i·x_i + Σ_{i<j} J_ij·x_i·x_j          h_i = q_ii,   J_ij = 2·q_ij
 * ```
 *
 * with h and J as fixed-width signed integers. Two published widths:
 *
 *   - first generation, 1,024 bits: 26-bit linear, 16-bit quadratic
 *     (Aramon et al. 2019, §IV);
 *   - FujitsuDA3Solver (third generation onward), 100,000 bits: 76-bit linear,
 *     64-bit quadratic (Fujitsu Computing as a Service, Digital Annealer
 *     User's Guide).
 *
 * A Q that is not integral, or too large, has to be scaled and rounded first.
 * The paper did exactly that for its Gaussian instances — "scale the
 * coefficients up to their maximum limit and then round to the nearest integer"
 * — and Fujitsu's service does it automatically. Rounding can move the optimum,
 * which is the point of exposing it: a big penalty P stretches the coefficient
 * range, and at low precision the objective's small terms round away.
 */

export type DaPrecision = {
  id: string;
  /** Signed width of the linear coefficients h_i. */
  linearBits: number;
  /** Signed width of the quadratic coefficients J_ij. */
  quadraticBits: number;
};

export const DA_FIRST_GENERATION: DaPrecision = { id: 'da1', linearBits: 26, quadraticBits: 16 };
export const DA_THIRD_GENERATION: DaPrecision = { id: 'da3', linearBits: 76, quadraticBits: 64 };

/** Largest magnitude a signed register of this width holds: 2^(bits−1) − 1. */
export function registerLimit(bits: number): number {
  return 2 ** (bits - 1) - 1;
}

/** Signed bits needed to hold the integer v exactly. */
function bitsFor(v: number): number {
  const a = Math.abs(v);
  return a === 0 ? 1 : Math.floor(Math.log2(a)) + 2;
}

export type PrecisionReport = {
  integral: boolean;
  maxLinear: number;
  maxQuadratic: number;
  /** Signed bits the coefficients need as they stand (only meaningful when integral). */
  linearBitsNeeded: number;
  quadraticBitsNeeded: number;
  /** Integral and within both registers: loads unchanged. */
  fits: boolean;
};

export function precisionReport(Q: number[][], target: DaPrecision): PrecisionReport {
  const n = Q.length;
  let integral = true;
  let maxLinear = 0;
  let maxQuadratic = 0;
  for (let i = 0; i < n; i++) {
    const h = Q[i][i];
    if (!Number.isInteger(h)) integral = false;
    maxLinear = Math.max(maxLinear, Math.abs(h));
    for (let j = i + 1; j < n; j++) {
      const J = 2 * Q[i][j];
      if (!Number.isInteger(J)) integral = false;
      maxQuadratic = Math.max(maxQuadratic, Math.abs(J));
    }
  }
  const linearBitsNeeded = bitsFor(maxLinear);
  const quadraticBitsNeeded = bitsFor(maxQuadratic);
  return {
    integral,
    maxLinear,
    maxQuadratic,
    linearBitsNeeded,
    quadraticBitsNeeded,
    fits:
      integral &&
      maxLinear <= registerLimit(target.linearBits) &&
      maxQuadratic <= registerLimit(target.quadraticBits),
  };
}

export type Quantized = {
  /** The rounded problem, back in this project's symmetric-Q convention. */
  Q: number[][];
  /** Multiplier applied before rounding; 1 when the input already fit. */
  scale: number;
  /** Coefficients whose value changed relative to scale·original. */
  rounded: number;
};

/**
 * Scale to the register limits and round, as the paper did. A Q that already
 * fits is returned unchanged with scale 1.
 *
 * The one scale serves both registers (it is the smaller of the two ratios), so
 * every coefficient is multiplied by the same factor and the argmin of an
 * unrounded problem would be untouched; only the rounding can move it.
 */
export function quantize(Q: number[][], target: DaPrecision): Quantized {
  const n = Q.length;
  const report = precisionReport(Q, target);
  if (report.fits) return { Q: Q.map((row) => row.slice()), scale: 1, rounded: 0 };

  // A 64-bit register outruns a double's 53-bit mantissa, and an energy sums up
  // to n² coefficients. Cap the target so every energy stays exactly
  // representable here; the DA3 widths are never the binding limit in practice.
  const safe = Math.floor(Number.MAX_SAFE_INTEGER / Math.max(1, n * n));
  const limit = (bits: number) => Math.min(registerLimit(bits), safe);
  const ratios: number[] = [];
  if (report.maxLinear > 0) ratios.push(limit(target.linearBits) / report.maxLinear);
  if (report.maxQuadratic > 0) ratios.push(limit(target.quadraticBits) / report.maxQuadratic);
  const scale = ratios.length ? Math.min(...ratios) : 1;

  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let rounded = 0;
  for (let i = 0; i < n; i++) {
    const h = Q[i][i] * scale;
    const hr = Math.round(h);
    if (hr !== h) rounded++;
    out[i][i] = hr;
    for (let j = i + 1; j < n; j++) {
      const J = 2 * Q[i][j] * scale;
      const Jr = Math.round(J);
      if (Jr !== J) rounded++;
      out[i][j] = Jr / 2;
      out[j][i] = Jr / 2;
    }
  }
  return { Q: out, scale, rounded };
}
