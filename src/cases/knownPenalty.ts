/**
 * §4 — cases whose constraints have a ready-made quadratic penalty in the
 * table on p.10, so no general machinery is needed: just look the row up.
 */

import type { QuboCase } from '../types';
import { clause, decisionVars, neg, pos, unitRow } from './helpers';
import { TUTORIAL_GRAPH } from './natural';

/**
 * §4.1, pp.11–12 — Minimum Vertex Cover on the same graph as §3.2.
 *
 * Each edge contributes `xᵢ + xⱼ ≥ 1` (row 2 of the table) →
 * `P(1 − xᵢ − xⱼ + xᵢxⱼ)`. With `P = 8` the diagonal becomes `1 − P·deg(j)`,
 * which is why the two degree-3 nodes read −23 and the degree-2 nodes −15.
 */
export const minVertexCover: QuboCase = {
  id: 'min-vertex-cover',
  section: '§4.1',
  pages: [11, 12],
  group: 'knownPenalty',
  penalty: { paperValue: 8, min: 0, max: 24, step: 1 },
  editable: true,
  graph: TUTORIAL_GRAPH,
  model: {
    sense: 'min',
    numVars: 5,
    varMeta: decisionVars(5),
    linear: [1, 1, 1, 1, 1],
    quadratic: [],
    constraints: TUTORIAL_GRAPH.edges.map(([a, b]) =>
      unitRow(5, [a - 1, b - 1], '>=', 1, 'atLeastOne', `edge (${a},${b})`),
    ),
  },
  paperQ: [
    [-15, 4, 4, 0, 0],
    [4, -15, 0, 4, 0],
    [4, 0, -23, 4, 4],
    [0, 4, 4, -23, 4],
    [0, 0, 4, 4, -15],
  ],
  paperConstant: 48, // 6 edges × P
  paperSolution: { x: [0, 1, 1, 0, 1], yQubo: -45, yOriginal: 3 },
};

/**
 * §4.2, pp.13–14 — Set Packing.
 *
 * Both rows are `Σ xⱼ ≤ 1`, i.e. Transformation #2. Because the objective is a
 * MAXIMISATION the penalties are subtracted, so the off-diagonals come out
 * negative (`−P/2 = −3` at `P = 6`).
 */
export const setPacking: QuboCase = {
  id: 'set-packing',
  section: '§4.2',
  pages: [13, 14],
  group: 'knownPenalty',
  penalty: { paperValue: 6, min: 0, max: 20, step: 1 },
  editable: false,
  model: {
    sense: 'max',
    numVars: 4,
    varMeta: decisionVars(4),
    linear: [1, 1, 1, 1],
    quadratic: [],
    constraints: [
      unitRow(4, [0, 2, 3], '<=', 1, 'transform2', 'x₁ + x₃ + x₄ ≤ 1'),
      unitRow(4, [0, 1], '<=', 1, 'transform2', 'x₁ + x₂ ≤ 1'),
    ],
  },
  paperQ: [
    [1, -3, -3, -3],
    [-3, 1, 0, 0],
    [-3, 0, 1, -3],
    [-3, 0, -3, 1],
  ],
  paperConstant: 0,
  paperSolution: { x: [0, 1, 1, 0], yQubo: 2, yOriginal: 2 },
};

/**
 * §4.3, pp.14–16 — Max 2-SAT with 4 variables and 12 clauses.
 *
 * The celebrated property of this formulation (p.17): the QUBO size is set by
 * the VARIABLE count and is completely independent of the clause count — "a Max
 * 2-Sat problem with 200 variables and 30,000 clauses can be modeled and solved
 * as a QUBO model with just 200 variables".
 *
 * This is also the one case whose Q legitimately contains halves, because a
 * lone `−x₂x₃` term splits into ∓½ across the symmetric pair.
 */
export const max2Sat: QuboCase = {
  id: 'max-2-sat',
  section: '§4.3',
  pages: [14, 16],
  group: 'knownPenalty',
  penalty: null,
  editable: true,
  model: {
    sense: 'min', // minimise the number of UNSATISFIED clauses
    numVars: 4,
    varMeta: decisionVars(4),
    linear: [0, 0, 0, 0],
    quadratic: [],
    constraints: [],
    clauses: [
      clause(pos(1), pos(2)),
      clause(pos(1), neg(2)),
      clause(neg(1), pos(2)),
      clause(neg(1), neg(2)),
      clause(neg(1), pos(3)),
      clause(neg(1), neg(3)),
      clause(pos(2), neg(3)),
      clause(pos(2), pos(4)),
      clause(neg(2), pos(3)),
      clause(neg(2), neg(3)),
      clause(pos(3), pos(4)),
      clause(neg(3), neg(4)),
    ],
  },
  paperQ: [
    [1, 0, 0, 0],
    [0, 0, -0.5, 0.5],
    [0, -0.5, 0, 1],
    [0, 0.5, 1, -2],
  ],
  paperConstant: 3,
  // 11 of 12 clauses satisfied ⇒ 1 unsatisfied.
  paperSolution: { x: [0, 0, 0, 1], yQubo: -2, yOriginal: 1 },
};
