/**
 * QUBO primitives: an accumulating builder plus evaluation helpers.
 *
 * The builder keeps Q in the paper's **full symmetric form** (§1: "In the
 * examples given in the following sections, we will work with the full,
 * symmetric Q matrix rather than adopting the upper triangular form"), so a
 * quadratic term `c·x_i x_j` lands as `c/2` in BOTH `Q[i][j]` and `Q[j][i]`.
 * That is why §4.3's Q legitimately contains halves.
 */

import type { Contribution, QuboModel, Sense, VarMeta } from './types';

export function zeros(n: number): number[][] {
  return Array.from({ length: n }, () => new Array<number>(n).fill(0));
}

/** Accumulates linear / quadratic / constant terms into a symmetric Q. */
export class QuboBuilder {
  readonly n: number;
  readonly Q: number[][];
  constant = 0;
  readonly provenance = new Map<string, Contribution[]>();

  /** Source tag applied to every term added until `enter()` is called again. */
  private source = 'objective';
  private detail = '';

  constructor(n: number) {
    this.n = n;
    this.Q = zeros(n);
  }

  /** Tag subsequent contributions so the heatmap can explain each cell. */
  enter(source: string, detail: string): this {
    this.source = source;
    this.detail = detail;
    return this;
  }

  private note(i: number, j: number, amount: number) {
    if (amount === 0) return;
    const key = `${i},${j}`;
    const list = this.provenance.get(key);
    const entry: Contribution = { source: this.source, detail: this.detail, amount };
    if (list) list.push(entry);
    else this.provenance.set(key, [entry]);
  }

  /** `c · x_j`. Binary variables satisfy `x_j = x_j²`, so linear terms live on the diagonal. */
  addLinear(j: number, c: number): this {
    if (c === 0) return this;
    this.Q[j][j] += c;
    this.note(j, j, c);
    return this;
  }

  /** `c · x_i x_j`, split symmetrically. Passing `i === j` folds into the diagonal. */
  addQuadratic(i: number, j: number, c: number): this {
    if (c === 0) return this;
    if (i === j) return this.addLinear(i, c);
    const half = c / 2;
    this.Q[i][j] += half;
    this.Q[j][i] += half;
    this.note(i, j, half);
    this.note(j, i, half);
    return this;
  }

  addConstant(c: number): this {
    this.constant += c;
    return this;
  }

  /**
   * **Transformation #1** — add `P·(Σ a_j x_j − b)²`.
   *
   * Expanding with `x_j² = x_j`:
   *
   * ```
   * P(Σ a_j x_j − b)² = P·Σ_j (a_j² − 2b·a_j)·x_j
   *                   + P·Σ_{i<j} 2·a_i·a_j·x_i x_j
   *                   + P·b²
   * ```
   *
   * The `2·a_i·a_j` coefficient then halves under the symmetric split, which is
   * why the paper's off-diagonal entries come out as plain `P·a_i·a_j`
   * (matching its own shortcut in §5.1 Remark 2: `q_ij = P·r_ij`).
   */
  addSquaredLinear(coeffs: number[], b: number, P: number): this {
    for (let j = 0; j < coeffs.length; j++) {
      const a = coeffs[j];
      if (a === 0) continue;
      this.addLinear(j, P * (a * a - 2 * b * a));
    }
    for (let i = 0; i < coeffs.length; i++) {
      if (coeffs[i] === 0) continue;
      for (let j = i + 1; j < coeffs.length; j++) {
        if (coeffs[j] === 0) continue;
        this.addQuadratic(i, j, 2 * P * coeffs[i] * coeffs[j]);
      }
    }
    return this.addConstant(P * b * b);
  }

  build(sense: Sense, varMeta: VarMeta[], P: number): QuboModel {
    return {
      n: this.n,
      varMeta,
      sense,
      Q: this.Q,
      constant: this.constant,
      provenance: this.provenance,
      P,
    };
  }
}

/** Evaluate `xᵀQx` for a 0/1 assignment. */
export function evaluate(Q: number[][], x: number[] | Uint8Array): number {
  let y = 0;
  const n = Q.length;
  for (let i = 0; i < n; i++) {
    if (!x[i]) continue;
    const row = Q[i];
    y += row[i];
    for (let j = i + 1; j < n; j++) {
      if (x[j]) y += 2 * row[j];
    }
  }
  return y;
}

/** The ORIGINAL objective value, i.e. `xᵀQx` with the dropped constant restored. */
export function originalObjective(model: QuboModel, x: number[] | Uint8Array): number {
  return evaluate(model.Q, x) + model.constant;
}

/** Flatten a symmetric Q into the dense row-major `Float64Array` the workers use. */
export function flatten(Q: number[][]): Float64Array {
  const n = Q.length;
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] = Q[i][j];
  return out;
}

/** Upper-triangular form (§1): fold `q_ji` into `q_ij` for `j > i`, then zero the lower half. */
export function toUpperTriangular(Q: number[][]): number[][] {
  const n = Q.length;
  const out = zeros(n);
  for (let i = 0; i < n; i++) {
    out[i][i] = Q[i][i];
    for (let j = i + 1; j < n; j++) out[i][j] = Q[i][j] + Q[j][i];
  }
  return out;
}

/**
 * Binary expansion of a slack variable bounded by `U`, using the paper's plain
 * powers of two: `k = ⌊log₂U⌋ + 1` bits with weights `1, 2, 4, …`.
 *
 * §5.3 does exactly this — `0 ≤ s₃ ≤ 6 ⇒ s₃ = 1x₈ + 2x₉ + 4x₁₀` — accepting
 * that three bits reach 7 and therefore slightly over-cover the bound of 6.
 */
export function slackWeights(U: number): number[] {
  if (U <= 0) return [];
  const bits = Math.floor(Math.log2(U)) + 1;
  return Array.from({ length: bits }, (_, k) => 2 ** k);
}

/**
 * The widest the slack activity could possibly be, from the constraint row
 * alone. Shown next to the paper's hand-picked bound so the reader can see the
 * judgement call the authors made.
 */
export function autoSlackBound(coeffs: number[], rel: '<=' | '>=', rhs: number): number {
  let lo = 0;
  let hi = 0;
  for (const a of coeffs) {
    if (a > 0) hi += a;
    else lo += a;
  }
  // `<=`: slack = rhs − a·x, largest when a·x is smallest.
  // `>=`: surplus = a·x − rhs, largest when a·x is largest.
  const bound = rel === '<=' ? rhs - lo : hi - rhs;
  return Math.max(0, bound);
}

/** Are two matrices equal within a tolerance? Returns the offending cells. */
export function diffMatrices(
  a: number[][],
  b: number[][],
  tol = 1e-9,
): { equal: boolean; cells: { i: number; j: number; a: number; b: number }[] } {
  const cells: { i: number; j: number; a: number; b: number }[] = [];
  if (a.length !== b.length) {
    return { equal: false, cells };
  }
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a.length; j++) {
      if (Math.abs(a[i][j] - b[i][j]) > tol) cells.push({ i, j, a: a[i][j], b: b[i][j] });
    }
  }
  return { equal: cells.length === 0, cells };
}
