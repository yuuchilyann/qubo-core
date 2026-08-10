/** Small builders that keep the case files readable. */

import type { Clause, Constraint, Literal, VarMeta } from '../types';

const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** `12` → `₁₂` */
export function sub(k: number): string {
  return String(k)
    .split('')
    .map((d) => SUB[Number(d)])
    .join('');
}

/** `x₁ … xₙ`, all plain decision variables. */
export function decisionVars(n: number): VarMeta[] {
  return Array.from({ length: n }, (_, k) => ({
    name: `x${sub(k + 1)}`,
    kind: 'decision' as const,
  }));
}

/**
 * Variables for a "node × attribute" model, flattened the way the paper does it
 * — §5.2: `(x₁₁, x₁₂, x₁₃, x₂₁, …, x₅₃) = (x₁, x₂, …, x₁₅)`.
 */
export function gridVars(
  rows: number,
  cols: number,
  key: 'color' | 'location',
): VarMeta[] {
  const out: VarMeta[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const idx = out.length;
      out.push({
        name: `x${sub(idx + 1)}`,
        kind: 'decision',
        origin: `x${sub(r)}${sub(c)}`,
        ...(key === 'color' ? { node: r, color: c } : { facility: r, location: c }),
      });
    }
  }
  return out;
}

/** A constraint row given as a sparse index list with unit coefficients. */
export function unitRow(
  n: number,
  indices: number[],
  rel: Constraint['rel'],
  rhs: number,
  method: Constraint['method'],
  label?: string,
): Constraint {
  const coeffs = new Array<number>(n).fill(0);
  for (const i of indices) coeffs[i] = 1;
  return { coeffs, rel, rhs, method, label };
}

/** A constraint row given as a dense coefficient list. */
export function row(
  coeffs: number[],
  rel: Constraint['rel'],
  rhs: number,
  method: Constraint['method'],
  label?: string,
  slackBound?: number,
): Constraint {
  return { coeffs, rel, rhs, method, label, slackBound };
}

/** `x_v` (1-based as written in the paper) as a positive literal. */
export function pos(v: number): Literal {
  return { v: v - 1, negated: false };
}

/** `¬x_v` (1-based) as a negated literal. */
export function neg(v: number): Literal {
  return { v: v - 1, negated: true };
}

export function clause(a: Literal, b: Literal): Clause {
  return [a, b];
}

/** Convert 1-based edges as printed in the paper to 0-based variable indices. */
export function edges1(pairs: [number, number][]): [number, number][] {
  return pairs.map(([a, b]) => [a - 1, b - 1] as [number, number]);
}
