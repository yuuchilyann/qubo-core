/**
 * How a constrained model would be handed to a third-generation-or-later
 * Digital Annealer, as opposed to how the paper hands it to a QUBO solver.
 *
 * The paper folds every constraint into one Q with a single penalty scalar P
 * that the modeller must choose. From the third generation on, Fujitsu's
 * service accepts more structure (Fujitsu Computing as a Service, Digital
 * Annealer User's Guide; FujitsuDA3Solver):
 *
 *   1. **Cost and penalty as separate polynomials** (`binary_polynomial`,
 *      `penalty_binary_polynomial`), so the solver can weigh — and, in its
 *      automatic penalty mode, raise — the penalty during the anneal instead of
 *      taking a fixed P.
 *   2. **One-hot groups** declared directly, one-way (disjoint groups) or
 *      two-way (a grid whose rows and columns are each one-hot).
 *   3. **Linear inequalities** declared directly, which removes the slack bits
 *      the paper adds to close them.
 *
 * Nothing here is written by hand. `splitPenalty` derives the model twice, at
 * P = 0 and P = 1, and takes the difference: `deriveModel` scales every
 * penalty by P and nothing else, so Q(P) = Q(0) + P·(Q(1) − Q(0)). That
 * identity is checked, not assumed (`verify:anneal`).
 *
 * This describes the STRUCTURE of a submission. It is not Fujitsu's wire format:
 * the request schema lives in Fujitsu's API reference, which is not public, and
 * details such as how one-hot groups must be ordered are not reproduced here.
 */

import { deriveModel } from '../derive';
import type { ConstrainedModel, VarMeta } from '../types';

/** A quadratic polynomial in this project's symmetric-Q convention: `xᵀQx + constant`. */
export type QuadraticPolynomial = { Q: number[][]; constant: number };

export type PenaltySplit = {
  /** Variables of the derived model, slack and auxiliary bits included. */
  varMeta: VarMeta[];
  /**
   * The objective, as a quantity to MINIMISE (negated for a `max` model), with
   * no penalty in it. Its constant makes `xᵀQx + constant` the original
   * objective value (negated for `max`).
   */
  cost: QuadraticPolynomial;
  /**
   * Every penalty at P = 1, also as a quantity to minimise: zero exactly when
   * the constraints hold (with the right slack and auxiliary bits), positive
   * otherwise.
   */
  penalty: QuadraticPolynomial;
};

function minus(a: number[][], b: number[][]): number[][] {
  return a.map((row, i) => row.map((v, j) => v - b[i][j]));
}

function scale(a: number[][], s: number): number[][] {
  // `+ 0` turns a −0 from negating a zero into a plain 0.
  return a.map((row) => row.map((v) => s * v + 0));
}

export function splitPenalty(model: ConstrainedModel): PenaltySplit {
  const sign = model.sense === 'min' ? 1 : -1;
  const at0 = deriveModel(model, 0).model;
  const at1 = deriveModel(model, 1).model;
  return {
    varMeta: at1.varMeta,
    cost: { Q: scale(at0.Q, sign), constant: sign * at0.constant + 0 },
    penalty: {
      Q: scale(minus(at1.Q, at0.Q), sign),
      constant: sign * (at1.constant - at0.constant) + 0,
    },
  };
}

/** Evaluate `xᵀQx + constant`. */
export function evaluatePolynomial(p: QuadraticPolynomial, x: number[] | Uint8Array): number {
  let e = p.constant;
  const n = p.Q.length;
  for (let i = 0; i < n; i++) {
    if (!x[i]) continue;
    e += p.Q[i][i];
    for (let j = i + 1; j < n; j++) if (x[j]) e += 2 * p.Q[i][j];
  }
  return e;
}

/** How one constraint of the ORIGINAL model would be declared. */
export type NativeKind =
  /** `Σ_{j∈S} x_j = 1`: a one-hot group. */
  | 'oneHot'
  /** `≤` or `≥`: a linear inequality, no slack bits needed. */
  | 'inequality'
  /** Any other equality: stays a penalty term, `(Σ a_j x_j − b)²`. */
  | 'equality';

export type NativeConstraint = {
  index: number;
  kind: NativeKind;
  /** Variables with a nonzero coefficient. */
  support: number[];
  /** Slack bits the paper's QUBO spends on this row (0 unless it is an inequality closed by slack). */
  slackBits: number;
};

export type OneHotLayout =
  | { kind: 'none' }
  /** Pairwise disjoint groups. */
  | { kind: 'oneWay'; groups: number[][] }
  /** Two families, each partitioning the same variables, every row meeting every column once. */
  | { kind: 'twoWay'; rows: number[][]; cols: number[][] }
  /** Groups that overlap without forming a grid: only part can go to the one-hot interface. */
  | { kind: 'overlapping'; groups: number[][] };

export type NativeForm = {
  constraints: NativeConstraint[];
  oneHot: OneHotLayout;
  /** Slack bits the paper's QUBO needs and a native-inequality submission does not. */
  slackSaved: number;
  /** Variables of the paper's QUBO, and of a submission with native inequalities. */
  paperVars: number;
  nativeVars: number;
};

function supportOf(coeffs: number[]): number[] {
  const s: number[] = [];
  coeffs.forEach((c, j) => c !== 0 && s.push(j));
  return s;
}

function disjoint(groups: number[][]): boolean {
  const seen = new Set<number>();
  for (const g of groups) {
    for (const v of g) {
      if (seen.has(v)) return false;
      seen.add(v);
    }
  }
  return true;
}

function sameCover(a: number[][], b: number[][]): boolean {
  const sa = a.flat().sort((x, y) => x - y);
  const sb = b.flat().sort((x, y) => x - y);
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/**
 * Split the one-hot groups into rows and columns if they form a grid. A group
 * joins the row family when it is disjoint from every row so far; the rest must
 * then be disjoint among themselves, cover the same variables, and meet each
 * row in exactly one variable.
 */
function layout(groups: number[][]): OneHotLayout {
  if (!groups.length) return { kind: 'none' };
  if (disjoint(groups)) return { kind: 'oneWay', groups };

  const rows: number[][] = [];
  const cols: number[][] = [];
  for (const g of groups) (disjoint([...rows, g]) ? rows : cols).push(g);
  const grid =
    disjoint(cols) &&
    sameCover(rows, cols) &&
    rows.every((r) => cols.every((c) => c.filter((v) => r.includes(v)).length === 1));
  return grid ? { kind: 'twoWay', rows, cols } : { kind: 'overlapping', groups };
}

export function nativeForm(model: ConstrainedModel): NativeForm {
  const derivation = deriveModel(model, 1);
  const slackOf = (k: number) =>
    derivation.slackInfo.find((s) => s.constraintIndex === k)?.weights.length ?? 0;

  const constraints = model.constraints.map((c, index): NativeConstraint => {
    const support = supportOf(c.coeffs);
    const oneHot = c.rel === '=' && c.rhs === 1 && support.every((j) => c.coeffs[j] === 1);
    const kind: NativeKind = oneHot ? 'oneHot' : c.rel === '=' ? 'equality' : 'inequality';
    return { index, kind, support, slackBits: slackOf(index) };
  });

  const slackSaved = constraints
    .filter((c) => c.kind === 'inequality')
    .reduce((s, c) => s + c.slackBits, 0);
  const paperVars = derivation.model.n;

  return {
    constraints,
    oneHot: layout(constraints.filter((c) => c.kind === 'oneHot').map((c) => c.support)),
    slackSaved,
    paperVars,
    nativeVars: paperVars - slackSaved,
  };
}
