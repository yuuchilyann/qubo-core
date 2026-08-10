/**
 * §5 — the general-purpose route. Transformation #1 (`P(Ax − b)²`), Transformation
 * #2 (`Σ xⱼ ≤ 1 ⇒ P Σ xᵢxⱼ`), slack variables via binary expansion, or a mixture.
 */

import type { Constraint, Graph, QuboCase } from '../types';
import { decisionVars, gridVars, row, unitRow } from './helpers';

/**
 * §5.1, pp.19–20 — Set Partitioning.
 *
 * Straight Transformation #1 on four equality rows at `P = 10`. The paper's own
 * shortcut (Remark 2, p.21) says `qᵢᵢ = cᵢ − P·kᵢ` and `qᵢⱼ = P·rᵢⱼ`, where
 * `kⱼ` counts the constraints containing `xⱼ` and `rᵢⱼ` the constraints
 * containing both — a useful cross-check on the general derivation.
 */
export const setPartitioning: QuboCase = {
  id: 'set-partitioning',
  section: '§5.1',
  pages: [19, 20],
  group: 'general',
  penalty: { paperValue: 10, min: 0, max: 40, step: 1 },
  editable: false,
  model: {
    sense: 'min',
    numVars: 6,
    varMeta: decisionVars(6),
    linear: [3, 2, 1, 1, 3, 2],
    quadratic: [],
    constraints: [
      unitRow(6, [0, 2, 5], '=', 1, 'transform1', 'x₁ + x₃ + x₆ = 1'),
      unitRow(6, [1, 2, 4, 5], '=', 1, 'transform1', 'x₂ + x₃ + x₅ + x₆ = 1'),
      unitRow(6, [2, 3, 4], '=', 1, 'transform1', 'x₃ + x₄ + x₅ = 1'),
      unitRow(6, [0, 1, 3, 5], '=', 1, 'transform1', 'x₁ + x₂ + x₄ + x₆ = 1'),
    ],
  },
  paperQ: [
    [-17, 10, 10, 10, 0, 20],
    [10, -18, 10, 10, 10, 20],
    [10, 10, -29, 10, 20, 20],
    [10, 10, 10, -19, 10, 10],
    [0, 10, 20, 10, -17, 10],
    [20, 20, 20, 10, 10, -28],
  ],
  paperConstant: 40, // 4 constraints × P
  paperSolution: { x: [1, 0, 0, 0, 1, 0], yQubo: -34, yOriginal: 6 },
};

/** The 5-node, 7-edge graph of §5.2. */
export const COLORING_GRAPH: Graph = {
  nodes: [1, 2, 3, 4, 5],
  edges: [
    [1, 2],
    [1, 5],
    [2, 3],
    [2, 4],
    [2, 5],
    [3, 4],
    [4, 5],
  ],
};

const K_COLORS = 3;

/** `x_{node,color}` → flat index, matching the paper's renumbering. */
const colorIdx = (node: number, color: number) => (node - 1) * K_COLORS + (color - 1);

function coloringConstraints(): Constraint[] {
  const n = COLORING_GRAPH.nodes.length * K_COLORS;
  const out: Constraint[] = [];
  // Every node takes exactly one colour — Transformation #1.
  for (const node of COLORING_GRAPH.nodes) {
    out.push(
      unitRow(
        n,
        Array.from({ length: K_COLORS }, (_, c) => colorIdx(node, c + 1)),
        '=',
        1,
        'transform1',
        `node ${node}: exactly one colour`,
      ),
    );
  }
  // Adjacent nodes never share a colour — Transformation #2. 7 edges × 3 colours.
  for (const [a, b] of COLORING_GRAPH.edges) {
    for (let c = 1; c <= K_COLORS; c++) {
      out.push(
        unitRow(
          n,
          [colorIdx(a, c), colorIdx(b, c)],
          '<=',
          1,
          'transform2',
          `edge (${a},${b}): not both colour ${c}`,
        ),
      );
    }
  }
  return out;
}

/**
 * §5.2, pp.21–24 — Graph Colouring with K = 3.
 *
 * The one case that uses BOTH transformations at once: #1 on the node-assignment
 * equations and #2 on the adjacency inequalities. Note the block-diagonal
 * structure the paper points out — "Looking for patterns is often a useful
 * de-bugging tool" (p.23) — visible as five 3×3 blocks on the diagonal.
 *
 * There is no objective function; any positive P will do, and the QUBO's job is
 * purely to find a feasible colouring.
 */
export const graphColoring: QuboCase = {
  id: 'graph-coloring',
  section: '§5.2',
  pages: [21, 24],
  group: 'general',
  penalty: { paperValue: 4, min: 1, max: 16, step: 1 },
  editable: true,
  graph: COLORING_GRAPH,
  model: {
    sense: 'min',
    numVars: 15,
    varMeta: gridVars(5, K_COLORS, 'color'),
    linear: new Array<number>(15).fill(0),
    quadratic: [],
    constraints: coloringConstraints(),
  },
  paperQ: [
    [-4, 4, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0],
    [4, -4, 4, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0],
    [4, 4, -4, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2],
    [2, 0, 0, -4, 4, 4, 2, 0, 0, 2, 0, 0, 2, 0, 0],
    [0, 2, 0, 4, -4, 4, 0, 2, 0, 0, 2, 0, 0, 2, 0],
    [0, 0, 2, 4, 4, -4, 0, 0, 2, 0, 0, 2, 0, 0, 2],
    [0, 0, 0, 2, 0, 0, -4, 4, 4, 2, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 2, 0, 4, -4, 4, 0, 2, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 2, 4, 4, -4, 0, 0, 2, 0, 0, 0],
    [0, 0, 0, 2, 0, 0, 2, 0, 0, -4, 4, 4, 2, 0, 0],
    [0, 0, 0, 0, 2, 0, 0, 2, 0, 4, -4, 4, 0, 2, 0],
    [0, 0, 0, 0, 0, 2, 0, 0, 2, 4, 4, -4, 0, 0, 2],
    [2, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, -4, 4, 4],
    [0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 4, -4, 4],
    [0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 2, 4, 4, -4],
  ],
  paperConstant: 20, // 5 assignment equations × P
  // x₂ = x₄ = x₉ = x₁₁ = x₁₅ = 1 ⇒ nodes 1,4 → colour 2; node 2 → colour 1;
  // nodes 3,5 → colour 3.
  paperSolution: {
    x: [0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1],
    yQubo: -20,
    yOriginal: 0,
  },
};

/**
 * §5.3, pp.25–26 — General 0/1 programming with a mixture of `≤`, `=` and `≥`.
 *
 * The two inequalities are closed with slack variables expanded in binary. The
 * bounds (3 and 6) are the paper's own judgement calls — the widest bounds the
 * rows actually admit are 7 and 11 — which is why `slackBound` is stated
 * explicitly rather than derived.
 */
export const general01: QuboCase = {
  id: 'general-01',
  section: '§5.3',
  pages: [25, 26],
  group: 'general',
  penalty: { paperValue: 10, min: 0, max: 30, step: 1 },
  editable: false,
  model: {
    sense: 'max',
    numVars: 5,
    varMeta: decisionVars(5),
    linear: [6, 4, 8, 5, 5],
    quadratic: [],
    constraints: [
      row([2, 2, 4, 3, 2], '<=', 7, 'transform1', '2x₁+2x₂+4x₃+3x₄+2x₅ ≤ 7', 3),
      row([1, 2, 2, 1, 2], '=', 4, 'transform1', '1x₁+2x₂+2x₃+1x₄+2x₅ = 4'),
      row([3, 3, 2, 4, 4], '>=', 5, 'transform1', '3x₁+3x₂+2x₃+4x₄+4x₅ ≥ 5', 6),
    ],
  },
  paperQ: [
    [526, -150, -160, -190, -180, -20, -40, 30, 60, 120],
    [-150, 574, -180, -200, -200, -20, -40, 30, 60, 120],
    [-160, -180, 688, -220, -200, -40, -80, 20, 40, 80],
    [-190, -200, -220, 645, -240, -30, -60, 40, 80, 160],
    [-180, -200, -200, -240, 605, -20, -40, 40, 80, 160],
    [-20, -20, -40, -30, -20, 130, -20, 0, 0, 0],
    [-40, -40, -80, -60, -40, -20, 240, 0, 0, 0],
    [30, 30, 20, 40, 40, 0, 0, -110, -20, -40],
    [60, 60, 40, 80, 80, 0, 0, -20, -240, -80],
    [120, 120, 80, 160, 160, 0, 0, -40, -80, -560],
  ],
  paperConstant: -900,
  // x₁ = x₄ = x₅ = x₉ = x₁₀ = 1
  paperSolution: {
    x: [1, 0, 0, 1, 1, 0, 0, 0, 1, 1],
    yQubo: 916,
    yOriginal: 16,
  },
};

const QAP_FLOW = [
  [0, 5, 2],
  [5, 0, 3],
  [2, 3, 0],
];
const QAP_DIST = [
  [0, 8, 15],
  [8, 0, 13],
  [15, 13, 0],
];

/**
 * §5.4, pp.27–29 — Quadratic Assignment with 3 facilities and 3 locations.
 *
 * `n²` variables for `n` facilities, which is why QAP models get large fast. The
 * coefficient on `x_{ik}·x_{jl}` is `f_{ij}·d_{kl}` summed over the (i,j) and
 * (j,i) orderings, i.e. `2·f_{ij}·d_{kl}`.
 *
 * ⚠️ The objective LINE printed on p.28 disagrees with the Q matrix printed on
 * p.29 in three places; the Q matrix (and hence this derivation) is the one that
 * is self-consistent and that reproduces the paper's own answer of 218:
 *
 *   - `60x₂x₇` should be `32x₂x₇`  (Q[1][6] = 16 ⇒ coefficient 32)
 *   - `48x₅x₇` is missing entirely  (Q[4][6] = 24 ⇒ coefficient 48)
 *   - `90x₆x₇` is missing entirely  (Q[5][6] = 45 ⇒ coefficient 90)
 *
 * Enumerating all facility/location pairs yields 18 quadratic terms, not the 16
 * the objective line lists. This is exactly the kind of slip the reconciliation
 * harness exists to catch, and it is why Q is derived rather than transcribed.
 */
function qapQuadratic(): { i: number; j: number; coef: number }[] {
  const n = 3;
  const idx = (facility: number, location: number) => facility * n + location;
  const acc = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      for (let k = 0; k < n; k++) {
        for (let l = 0; l < n; l++) {
          if (k === l) continue;
          const coef = QAP_FLOW[i][j] * QAP_DIST[k][l];
          if (coef === 0) continue;
          const a = idx(i, k);
          const b = idx(j, l);
          if (a >= b) continue; // canonical i<j; the (j,i)(l,k) mirror doubles it
          const key = `${a},${b}`;
          acc.set(key, (acc.get(key) ?? 0) + 2 * coef);
        }
      }
    }
  }
  return [...acc].map(([key, coef]) => {
    const [i, j] = key.split(',').map(Number);
    return { i, j, coef };
  });
}

export const qap: QuboCase = {
  id: 'qap',
  section: '§5.4',
  pages: [27, 29],
  group: 'general',
  penalty: { paperValue: 200, min: 0, max: 600, step: 10 },
  editable: false,
  model: {
    sense: 'min',
    numVars: 9,
    varMeta: gridVars(3, 3, 'location'),
    linear: new Array<number>(9).fill(0),
    quadratic: qapQuadratic(),
    constraints: [
      unitRow(9, [0, 1, 2], '=', 1, 'transform1', 'facility 1: exactly one location'),
      unitRow(9, [3, 4, 5], '=', 1, 'transform1', 'facility 2: exactly one location'),
      unitRow(9, [6, 7, 8], '=', 1, 'transform1', 'facility 3: exactly one location'),
      unitRow(9, [0, 3, 6], '=', 1, 'transform1', 'location 1: exactly one facility'),
      unitRow(9, [1, 4, 7], '=', 1, 'transform1', 'location 2: exactly one facility'),
      unitRow(9, [2, 5, 8], '=', 1, 'transform1', 'location 3: exactly one facility'),
    ],
  },
  paperQ: [
    [-400, 200, 200, 200, 40, 75, 200, 16, 30],
    [200, -400, 200, 40, 200, 65, 16, 200, 26],
    [200, 200, -400, 75, 65, 200, 30, 26, 200],
    [200, 40, 75, -400, 200, 200, 200, 24, 45],
    [40, 200, 65, 200, -400, 200, 24, 200, 39],
    [75, 65, 200, 200, 200, -400, 45, 39, 200],
    [200, 16, 30, 200, 24, 45, -400, 200, 200],
    [16, 200, 26, 24, 200, 39, 200, -400, 200],
    [30, 26, 200, 45, 39, 200, 200, 200, -400],
  ],
  paperConstant: 1200, // 6 constraints × P
  paperSolution: {
    x: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    yQubo: -982,
    yOriginal: 218,
  },
};

/**
 * §5.5, pp.29–30 — Quadratic Knapsack with four projects.
 *
 * A maximisation with one `≤` budget row, closed by a two-bit slack
 * (`s = 1x₅ + 2x₆`, again a hand-picked bound of 3 rather than the row's
 * theoretical 16).
 */
export const quadraticKnapsack: QuboCase = {
  id: 'quadratic-knapsack',
  section: '§5.5',
  pages: [29, 30],
  group: 'general',
  penalty: { paperValue: 10, min: 0, max: 30, step: 1 },
  editable: false,
  model: {
    sense: 'max',
    numVars: 4,
    varMeta: decisionVars(4),
    linear: [2, 5, 2, 4],
    quadratic: [
      { i: 0, j: 1, coef: 8 },
      { i: 0, j: 2, coef: 6 },
      { i: 0, j: 3, coef: 10 },
      { i: 1, j: 2, coef: 2 },
      { i: 1, j: 3, coef: 6 },
      { i: 2, j: 3, coef: 4 },
    ],
    constraints: [
      row([8, 6, 5, 3], '<=', 16, 'transform1', '8x₁+6x₂+5x₃+3x₄ ≤ 16', 3),
    ],
  },
  paperQ: [
    [1922, -476, -397, -235, -80, -160],
    [-476, 1565, -299, -177, -60, -120],
    [-397, -299, 1352, -148, -50, -100],
    [-235, -177, -148, 874, -30, -60],
    [-80, -60, -50, -30, 310, -20],
    [-160, -120, -100, -60, -20, 600],
  ],
  paperConstant: -2560,
  paperSolution: {
    x: [1, 0, 1, 1, 0, 0],
    yQubo: 2588,
    yOriginal: 28,
  },
};
