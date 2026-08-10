/**
 * Derives a QUBO from a constrained model — the whole point of the paper.
 *
 * Nothing here is case-specific: every one of the eleven cases goes through this
 * one function. That is what makes the reconciliation harness meaningful, since
 * a match against `paperQ` then proves the GENERAL recipe reproduces the
 * publication, not that we transcribed eleven matrices correctly.
 */

import type {
  Clause,
  ConstrainedModel,
  Constraint,
  Literal,
  QuboCase,
  QuboModel,
  VarMeta,
} from './types';
import { QuboBuilder, autoSlackBound, slackWeights } from './qubo';

/** A single line of the formulation trace shown in the UI. */
export type DerivationStep = {
  kind: 'objective' | 'slack' | 'penalty';
  /** Penalty recipe used, for the localised heading. */
  method?: Constraint['method'];
  /** Index into `model.constraints`, when applicable. */
  constraintIndex?: number;
  /** KaTeX source for this step. */
  latex: string;
};

export type Derivation = {
  model: QuboModel;
  steps: DerivationStep[];
  /** Slack bounds actually used, alongside the widest bound implied by the row. */
  slackInfo: { constraintIndex: number; used: number; auto: number; weights: number[] }[];
};

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (k: number) =>
  String(k)
    .split('')
    .map((d) => SUB[Number(d)])
    .join('');

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toFixed(6)));
}

/** `Σ a_j x_j` as KaTeX, skipping zero coefficients. */
function linearLatex(coeffs: number[], names: string[]): string {
  const parts: string[] = [];
  for (let j = 0; j < coeffs.length; j++) {
    const a = coeffs[j];
    if (a === 0) continue;
    const sign = a < 0 ? '-' : parts.length ? '+' : '';
    const mag = Math.abs(a);
    const coef = mag === 1 ? '' : fmt(mag);
    parts.push(`${sign}${coef}${names[j]}`);
  }
  return parts.length ? parts.join('') : '0';
}

/** Indices with a non-zero coefficient — the support of a constraint row. */
function support(coeffs: number[]): number[] {
  const s: number[] = [];
  for (let j = 0; j < coeffs.length; j++) if (coeffs[j] !== 0) s.push(j);
  return s;
}

/**
 * Appends slack bits for every inequality routed through Transformation #1 and
 * returns the padded constraint rows.
 *
 * The paper closes `4x₁ + 5x₂ − x₃ ≤ 6` into `4x₁ + 5x₂ − x₃ + s = 6` and then
 * expands `s` in binary (§5, p.17). A `≥` row instead SUBTRACTS its surplus,
 * which is why §5.3's third row carries `−1x₈ − 2x₉ − 4x₁₀`.
 */
function expandSlack(model: ConstrainedModel): {
  varMeta: VarMeta[];
  rows: number[][];
  slackInfo: Derivation['slackInfo'];
} {
  const varMeta: VarMeta[] = model.varMeta.map((m) => ({ ...m }));
  const rows: number[][] = model.constraints.map((c) => [...c.coeffs]);
  const slackInfo: Derivation['slackInfo'] = [];

  model.constraints.forEach((c, k) => {
    if (c.method !== 'transform1' || c.rel === '=') return;
    const auto = autoSlackBound(c.coeffs, c.rel, c.rhs);
    const used = c.slackBound ?? auto;
    const weights = slackWeights(used);
    // `<=` adds slack, `>=` subtracts surplus.
    const sign = c.rel === '<=' ? 1 : -1;
    weights.forEach((w) => {
      const idx = varMeta.length;
      varMeta.push({
        name: `x${sub(idx + 1)}`,
        kind: 'slack',
        slackOf: k,
        weight: w,
      });
      // Every row grows by one column; only this constraint gets a coefficient.
      rows.forEach((row, r) => {
        row[idx] = r === k ? sign * w : 0;
      });
    });
    slackInfo.push({ constraintIndex: k, used, auto, weights });
  });

  // Pad any row that never grew (all rows must share the final width).
  const n = varMeta.length;
  rows.forEach((row) => {
    while (row.length < n) row.push(0);
  });

  return { varMeta, rows, slackInfo };
}

/** Indicator that a literal is FALSE — the factor a clause penalty is built from. */
function falseFactor(l: Literal): { constant: number; linear: number } {
  // `x_v` false ⇒ (1 − x_v);  `¬x_v` false ⇒ x_v.
  return l.negated ? { constant: 0, linear: 1 } : { constant: 1, linear: -1 };
}

/**
 * A two-literal clause is violated exactly when BOTH literals are false, so its
 * penalty is the product of the two "is false" indicators. Expanding that
 * product reproduces all three rows of the p.15 table without special-casing.
 */
function addClausePenalty(b: QuboBuilder, clause: Clause, P: number) {
  const [l1, l2] = clause;
  const f1 = falseFactor(l1);
  const f2 = falseFactor(l2);
  b.addConstant(P * f1.constant * f2.constant);
  b.addLinear(l1.v, P * f1.linear * f2.constant);
  b.addLinear(l2.v, P * f2.linear * f1.constant);
  b.addQuadratic(l1.v, l2.v, P * f1.linear * f2.linear);
}

function clauseLatex(clause: Clause, names: string[]): string {
  const lit = (l: Literal) => (l.negated ? `\\bar{${names[l.v]}}` : names[l.v]);
  return `(${lit(clause[0])} \\vee ${lit(clause[1])})`;
}

/**
 * Build the QUBO for a case at a given penalty scalar.
 *
 * `P` defaults to the value the paper chose; passing a different one is exactly
 * what the penalty slider does.
 */
export function derive(qcase: QuboCase, penalty?: number): Derivation {
  const model = qcase.model;
  const P = penalty ?? qcase.penalty?.paperValue ?? 1;
  // Minimising ADDS penalties; maximising SUBTRACTS them (§5.3, §5.5).
  const sign = model.sense === 'min' ? 1 : -1;

  const { varMeta, rows, slackInfo } = expandSlack(model);
  const names = varMeta.map((m) => m.name);
  const b = new QuboBuilder(varMeta.length);
  const steps: DerivationStep[] = [];

  // ── objective ────────────────────────────────────────────────────────────
  b.enter('objective', 'objective');
  if (model.cutEdges) {
    // §3.2: each edge contributes `x_i + x_j − 2x_i x_j`, which is 1 exactly
    // when the edge is severed by the cut.
    for (const [i, j] of model.cutEdges) {
      b.addLinear(i, 1);
      b.addLinear(j, 1);
      b.addQuadratic(i, j, -2);
    }
    steps.push({
      kind: 'objective',
      latex: `\\max\\; y = \\sum_{(i,j) \\in E} \\left(x_i + x_j - 2x_i x_j\\right)`,
    });
  } else {
    model.linear.forEach((c, j) => b.addLinear(j, c));
    for (const { i, j, coef } of model.quadratic) b.addQuadratic(i, j, coef);
    const lin = linearLatex(model.linear, names);
    const quad = model.quadratic
      .map(({ i, j, coef }) => {
        const s = coef < 0 ? '-' : '+';
        const mag = Math.abs(coef);
        return `${s}${mag === 1 ? '' : fmt(mag)}${names[i]}${names[j]}`;
      })
      .join('');
    const body = model.quadratic.length ? `${lin}${quad}` : lin;
    steps.push({
      kind: 'objective',
      latex: `\\${model.sense}\\; y = ${body}`,
    });
  }

  // ── Max-2-SAT clauses ────────────────────────────────────────────────────
  if (model.clauses) {
    model.clauses.forEach((clause, k) => {
      b.enter(`clause:${k}`, clauseLatex(clause, names));
      addClausePenalty(b, clause, P);
      steps.push({
        kind: 'penalty',
        constraintIndex: k,
        latex: `${clauseLatex(clause, names)} \\;\\longrightarrow\\; ${clausePenaltyLatex(clause, names)}`,
      });
    });
  }

  // ── slack expansion trace ────────────────────────────────────────────────
  for (const info of slackInfo) {
    const c = model.constraints[info.constraintIndex];
    const bits = info.weights
      .map((w, k) => {
        const idx = varMeta.findIndex(
          (m) => m.slackOf === info.constraintIndex && m.weight === w,
        );
        return `${k ? '+' : ''}${w === 1 ? '1' : w}${names[idx]}`;
      })
      .join('');
    const rel = c.rel === '<=' ? '\\le' : '\\ge';
    const s = `s_{${info.constraintIndex + 1}}`;
    steps.push({
      kind: 'slack',
      constraintIndex: info.constraintIndex,
      // The source constraint stays in MATH mode: wrapping it in \text{} would
      // make KaTeX print `\le` literally instead of rendering the relation.
      latex: `0 \\le ${s} \\le ${info.used} \\;\\Rightarrow\\; ${s} = ${bits} \\qquad \\left(${linearLatex(c.coeffs, names)} ${rel} ${fmt(c.rhs)}\\right)`,
    });
  }

  // ── constraint penalties ─────────────────────────────────────────────────
  model.constraints.forEach((c, k) => {
    const row = rows[k];
    const label = c.label ?? `constraint ${k + 1}`;
    b.enter(`constraint:${k}`, label);
    const Pk = sign * P;

    switch (c.method) {
      case 'transform1': {
        b.addSquaredLinear(row, c.rhs, Pk);
        steps.push({
          kind: 'penalty',
          method: c.method,
          constraintIndex: k,
          latex: `${sign > 0 ? '+' : '-'}P\\left(${linearLatex(row, names)} - ${fmt(c.rhs)}\\right)^2`,
        });
        break;
      }
      case 'transform2': {
        // `Σ_{j∈S} x_j ≤ 1` ⇒ `P·Σ_{i<j∈S} x_i x_j` (rows 1 and 5 of the p.10 table).
        const s = support(c.coeffs);
        const terms: string[] = [];
        for (let a = 0; a < s.length; a++) {
          for (let bIdx = a + 1; bIdx < s.length; bIdx++) {
            b.addQuadratic(s[a], s[bIdx], Pk);
            terms.push(`${names[s[a]]}${names[s[bIdx]]}`);
          }
        }
        steps.push({
          kind: 'penalty',
          method: c.method,
          constraintIndex: k,
          latex: `${sign > 0 ? '+' : '-'}P\\left(${terms.join('+')}\\right)`,
        });
        break;
      }
      case 'atLeastOne': {
        // `x_i + x_j ≥ 1` ⇒ `P(1 − x_i − x_j + x_i x_j)` (row 2).
        const [i, j] = support(c.coeffs);
        b.addConstant(Pk);
        b.addLinear(i, -Pk);
        b.addLinear(j, -Pk);
        b.addQuadratic(i, j, Pk);
        steps.push({
          kind: 'penalty',
          method: c.method,
          constraintIndex: k,
          latex: `${sign > 0 ? '+' : '-'}P\\left(1 - ${names[i]} - ${names[j]} + ${names[i]}${names[j]}\\right)`,
        });
        break;
      }
      case 'exactlyOne2': {
        // `x_i + x_j = 1` ⇒ `P(1 − x_i − x_j + 2x_i x_j)` (row 3).
        const [i, j] = support(c.coeffs);
        b.addConstant(Pk);
        b.addLinear(i, -Pk);
        b.addLinear(j, -Pk);
        b.addQuadratic(i, j, 2 * Pk);
        steps.push({
          kind: 'penalty',
          method: c.method,
          constraintIndex: k,
          latex: `${sign > 0 ? '+' : '-'}P\\left(1 - ${names[i]} - ${names[j]} + 2${names[i]}${names[j]}\\right)`,
        });
        break;
      }
      case 'implication': {
        // `x_i ≤ x_j` ⇒ `P(x_i − x_i x_j)` (row 4).
        const [i, j] = support(c.coeffs);
        b.addLinear(i, Pk);
        b.addQuadratic(i, j, -Pk);
        steps.push({
          kind: 'penalty',
          method: c.method,
          constraintIndex: k,
          latex: `${sign > 0 ? '+' : '-'}P\\left(${names[i]} - ${names[i]}${names[j]}\\right)`,
        });
        break;
      }
      case 'equal2': {
        // `x_i = x_j` ⇒ `P(x_i + x_j − 2x_i x_j)` (row 6).
        const [i, j] = support(c.coeffs);
        b.addLinear(i, Pk);
        b.addLinear(j, Pk);
        b.addQuadratic(i, j, -2 * Pk);
        steps.push({
          kind: 'penalty',
          method: c.method,
          constraintIndex: k,
          latex: `${sign > 0 ? '+' : '-'}P\\left(${names[i]} + ${names[j]} - 2${names[i]}${names[j]}\\right)`,
        });
        break;
      }
    }
  });

  return { model: b.build(model.sense, varMeta, P), steps, slackInfo };
}

function clausePenaltyLatex(clause: Clause, names: string[]): string {
  const [l1, l2] = clause;
  const a = names[l1.v];
  const c = names[l2.v];
  if (!l1.negated && !l2.negated) return `\\left(1 - ${a} - ${c} + ${a}${c}\\right)`;
  if (l1.negated && l2.negated) return `\\left(${a}${c}\\right)`;
  // Exactly one negation: the NON-negated literal's variable survives linearly.
  return l1.negated ? `\\left(${a} - ${a}${c}\\right)` : `\\left(${c} - ${a}${c}\\right)`;
}

/**
 * Check a 0/1 assignment against the ORIGINAL constraints (slack bits ignored).
 * Used both by the reconciliation harness and by the per-case feasibility panel.
 */
export function checkFeasibility(
  model: ConstrainedModel,
  x: number[] | Uint8Array,
): { feasible: boolean; rows: { index: number; lhs: number; ok: boolean }[] } {
  const rows = model.constraints.map((c, index) => {
    let lhs = 0;
    for (let j = 0; j < c.coeffs.length; j++) lhs += c.coeffs[j] * (x[j] ?? 0);
    const ok =
      c.rel === '=' ? lhs === c.rhs : c.rel === '<=' ? lhs <= c.rhs : lhs >= c.rhs;
    return { index, lhs, ok };
  });
  return { feasible: rows.every((r) => r.ok), rows };
}

/** Count of clauses left unsatisfied (§4.3's objective, stated positively). */
export function unsatisfiedClauses(clauses: Clause[], x: number[] | Uint8Array): number {
  let count = 0;
  for (const [l1, l2] of clauses) {
    const v1 = l1.negated ? !x[l1.v] : !!x[l1.v];
    const v2 = l2.negated ? !x[l2.v] : !!x[l2.v];
    if (!v1 && !v2) count++;
  }
  return count;
}
