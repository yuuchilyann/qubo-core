/**
 * One serialisation of a case's ORIGINAL model into the shape `build_qubo()`
 * expects.
 *
 * Both the emitted Python literal and the cross-verification script consume
 * this, so what `npm run verify:python` proves is a property of the exact bytes
 * the user copies — not of a parallel representation that happens to agree
 * today.
 */

import type { ConstrainedModel } from '../types';

export type PyModel = {
  sense: 'min' | 'max';
  num_vars: number;
  linear: number[];
  quadratic: [number, number, number][];
  constraints: {
    coeffs: number[];
    rel: string;
    rhs: number;
    method: string;
    slack_bound?: number;
  }[];
  clauses?: [number, boolean][][];
  cut_edges?: [number, number][];
};

/**
 * Takes the model rather than the case: a model assembled at runtime has to
 * serialise through this same function, or `verify:python` would be proving a
 * property of the catalogue instead of a property of the emitter.
 */
export function toPythonModel(m: ConstrainedModel): PyModel {
  const out: PyModel = {
    sense: m.sense,
    num_vars: m.numVars,
    linear: [...m.linear],
    quadratic: m.quadratic.map(({ i, j, coef }) => [i, j, coef] as [number, number, number]),
    constraints: m.constraints.map((c) => ({
      coeffs: [...c.coeffs],
      rel: c.rel,
      rhs: c.rhs,
      method: c.method,
      ...(c.slackBound === undefined ? {} : { slack_bound: c.slackBound }),
    })),
  };
  if (m.clauses) {
    out.clauses = m.clauses.map((clause) => clause.map((l) => [l.v, l.negated] as [number, boolean]));
  }
  if (m.cutEdges) out.cut_edges = m.cutEdges.map(([i, j]) => [i, j] as [number, number]);
  return out;
}

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
}

/** Render a JSON-ish value as Python source. */
export function pyRepr(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 4);

  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return num(value);
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const flat = value.map((v) => pyRepr(v, 0));
    const oneLine = `[${flat.join(', ')}]`;
    // Keep short rows on one line; the coefficient lists read far better that way.
    if (oneLine.length + indent <= 88 && !oneLine.includes('\n')) return oneLine;
    return `[\n${value.map((v) => `${inner}${pyRepr(v, indent + 4)},`).join('\n')}\n${pad}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const flat = entries.map(([k, v]) => `${JSON.stringify(k)}: ${pyRepr(v, 0)}`);
  const oneLine = `{${flat.join(', ')}}`;
  if (oneLine.length + indent <= 88 && !oneLine.includes('\n')) return oneLine;
  return `{\n${entries
    .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${pyRepr(v, indent + 4)},`)
    .join('\n')}\n${pad}}`;
}
