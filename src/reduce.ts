/**
 * Clause polynomials and Rosenberg's higher-order reduction (§7 point 4).
 *
 * A clause is violated exactly when every literal is false, so its penalty is
 * the product of the "is false" indicators — `(1 − x_v)` for `x_v`, `x_v` for
 * `¬x_v`. With two literals that product is quadratic (§4.3). With three it is
 * cubic, and a QUBO cannot hold a cubic term.
 *
 * The paper's remedy (p.36–37, after Rosenberg 1975): replace a product
 * `x_a x_b` by a new binary `y`, and add the penalty
 *
 *     P (x_a x_b − 2 x_a y − 2 x_b y + 3y)
 *
 * which is 0 exactly when `y = x_a x_b` and at least P otherwise. Applied
 * repeatedly, every term of degree three or more comes down to degree two.
 *
 * ⚠️ `src/python/module.ts` carries a line-by-line Python port of
 * `clausePolynomial` and `reduceHigherOrder`. Change one, change both;
 * `npm run verify:python` is the guard.
 */

import type { Clause } from './types';

/** A monomial `coef · Π_{v ∈ vars} x_v`, `vars` sorted ascending and free of repeats. */
export type Term = { vars: number[]; coef: number };

const keyOf = (vars: number[]) => vars.join(',');

/**
 * Expand `Π_l falseFactor(l)` into monomials.
 *
 * Variables are idempotent (`x² = x`), so a repeated variable merges rather
 * than raising the degree, and `x_v ∨ ¬x_v` cancels to nothing — a tautology
 * can never be violated.
 */
export function clausePolynomial(clause: Clause): Term[] {
  let poly = new Map<string, Term>([['', { vars: [], coef: 1 }]]);
  for (const l of clause) {
    // `x_v` false ⇒ (1 − x_v);  `¬x_v` false ⇒ x_v.
    const constant = l.negated ? 0 : 1;
    const linear = l.negated ? 1 : -1;
    const next = new Map<string, Term>();
    const add = (vars: number[], c: number) => {
      if (c === 0) return;
      const k = keyOf(vars);
      const t = next.get(k);
      if (t) t.coef += c;
      else next.set(k, { vars, coef: c });
    };
    for (const t of poly.values()) {
      add(t.vars, t.coef * constant);
      const merged = t.vars.includes(l.v) ? t.vars : [...t.vars, l.v].sort((a, b) => a - b);
      add(merged, t.coef * linear);
    }
    poly = next;
  }
  return [...poly.values()].filter((t) => t.coef !== 0);
}

/** One auxiliary variable: `y = x_a x_b`, and the total |coefficient| it carries. */
export type AuxVar = { index: number; a: number; b: number; load: number };

/**
 * Reduce every term of degree ≥ 3 to degree ≤ 2 by substituting products.
 *
 * Deterministic so the Python port can match it bit for bit: terms are taken
 * first-in first-out, and in each the two LOWEST variable indices are
 * substituted. A pair already substituted reuses its `y`. Aux indices start at
 * `firstAux` and grow in order of creation; a partly reduced term goes to the
 * back of the queue.
 *
 * `load` is the sum of |coef| over every term that used the substitution. If
 * `y ≠ x_a x_b`, those terms are off by at most `load`, so a reduction penalty
 * above the largest `load` keeps every optimum exact.
 */
export function reduceHigherOrder(
  terms: Term[],
  firstAux: number,
): { terms: Term[]; aux: AuxVar[] } {
  const aux: AuxVar[] = [];
  const auxByPair = new Map<string, AuxVar>();
  const out = new Map<string, Term>();
  const queue = terms.map((t) => ({ vars: [...t.vars], coef: t.coef }));

  const emit = (vars: number[], coef: number) => {
    const k = keyOf(vars);
    const t = out.get(k);
    if (t) t.coef += coef;
    else out.set(k, { vars, coef });
  };

  while (queue.length) {
    const t = queue.shift()!;
    if (t.coef === 0) continue;
    if (t.vars.length <= 2) {
      emit(t.vars, t.coef);
      continue;
    }
    const [a, b, ...rest] = t.vars;
    const pk = `${a},${b}`;
    let y = auxByPair.get(pk);
    if (!y) {
      y = { index: firstAux + aux.length, a, b, load: 0 };
      aux.push(y);
      auxByPair.set(pk, y);
    }
    y.load += Math.abs(t.coef);
    queue.push({ vars: [...rest, y.index].sort((p, q) => p - q), coef: t.coef });
  }

  return { terms: [...out.values()].filter((t) => t.coef !== 0), aux };
}
