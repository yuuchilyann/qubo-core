/**
 * Problems the paper NAMES but never works — the §1 list on pp.3–4 ("the QUBO
 * model encompasses the following important optimization problems").
 *
 * None of these has a published instance, Q or answer, so each is an
 * `ExtendedCase`: the instance is chosen here, and correctness is established
 * by exhaustive search over the original constrained model instead of a diff
 * against `paperQ`. Where possible the instance is one the paper already uses,
 * so that an `anchor` can tie the optimum to a number the paper does print.
 */

import type { ExtendedCase } from '../types';
import { decisionVars, labelledGrid, nonEdges, unitRow } from './helpers';
import { NUMBERS, TUTORIAL_GRAPH } from './natural';

/**
 * Maximum Independent Set, named in the §1 list (p.4) and again in §6 (p.34).
 *
 * Each edge forbids picking both endpoints: `xᵢ + xⱼ ≤ 1`, which is row 1 of the
 * p.10 table — the same `P·xᵢxⱼ` penalty §4.2 uses, and the one p.10 credits to
 * Pardalos & Xue for maximum clique "and related problems". Maximising, so the
 * penalty is subtracted and each edge puts `−P/2` on its two off-diagonal cells.
 *
 * The instance is §3.2/§4.1's graph on purpose. A set is independent exactly
 * when its complement is a vertex cover, so the optimum here must be 5 minus
 * §4.1's printed optimum — a value the paper implies without stating.
 *
 * P is ours, not the paper's: picking both ends of an edge gains 1 and costs P,
 * so any `P > 1` makes every infeasible set strictly worse. At `P = 1` such
 * sets tie with the optimum, which the slider lets a reader see happen.
 */
export const maxIndependentSet: ExtendedCase = {
  source: 'mentioned',
  id: 'max-independent-set',
  section: '§1',
  pages: [4, 4],
  group: 'knownPenalty',
  penalty: { paperValue: 2, min: 0, max: 6, step: 1 },
  editable: true,
  graph: TUTORIAL_GRAPH,
  model: {
    sense: 'max',
    numVars: 5,
    varMeta: decisionVars(5),
    linear: [1, 1, 1, 1, 1],
    quadratic: [],
    constraints: TUTORIAL_GRAPH.edges.map(([a, b]) =>
      unitRow(5, [a - 1, b - 1], '<=', 1, 'transform2', `edge (${a},${b})`),
    ),
  },
  anchor: {
    yOriginal: 2,
    via:
      "a set is independent exactly when its complement is a vertex cover (Gallai), so alpha = n - tau = 5 - 3, with tau = 3 from §4.1's printed answer on the same graph",
  },
};

/**
 * Maximum Clique, named in the §1 list (p.4), on p.10 (Pardalos & Xue's
 * `P·xᵢxⱼ` penalty "in the context of the maximum clique and related
 * problems"), and in §6 (p.32).
 *
 * A clique forbids picking two nodes that are NOT adjacent, so the constraints
 * come from the graph's non-edges: `xᵢ + xⱼ ≤ 1` for every missing edge, row 1
 * of the p.10 table again. It is Maximum Independent Set on the complement
 * graph, which is why the two cases share every line but the edge list.
 *
 * Same graph as §3.2/§4.1, whose only triangle is 3–4–5, so the optimum is 3
 * and unique. The paper implies no value for it, so there is no anchor. P is
 * ours for the same reason as in `maxIndependentSet`: picking both ends of a
 * non-edge gains 1 and costs P, so `P > 1` suffices.
 */
export const maxClique: ExtendedCase = {
  source: 'mentioned',
  id: 'max-clique',
  section: '§1',
  pages: [4, 4],
  group: 'knownPenalty',
  penalty: { paperValue: 2, min: 0, max: 6, step: 1 },
  editable: true,
  graph: TUTORIAL_GRAPH,
  model: {
    sense: 'max',
    numVars: 5,
    varMeta: decisionVars(5),
    linear: [1, 1, 1, 1, 1],
    quadratic: [],
    constraints: nonEdges(TUTORIAL_GRAPH.nodes, TUTORIAL_GRAPH.edges).map(([a, b]) =>
      unitRow(5, [a - 1, b - 1], '<=', 1, 'transform2', `non-edge (${a},${b})`),
    ),
  },
};

/** How many of §3.1's numbers `maxDiversity` must choose. */
const DIVERSITY_PICK = 4;

/**
 * Maximum Diversity, named in the §1 list (p.3): choose exactly `p` items so
 * the total pairwise distance among them is as large as possible.
 *
 * The objective is already quadratic — `max Σ dᵢⱼxᵢxⱼ` — and the only
 * constraint is the cardinality row `Σxⱼ = p`, closed with Transformation #1.
 *
 * The data are §3.1's eight numbers with `dᵢⱼ = |sᵢ − sⱼ|`, so no new numbers
 * are introduced. With `p = 4` the optimum is unique: {7, 10, 31, 42}, total
 * 126 — the two extremes plus the widest-spread middle pair.
 *
 * P is ours. Past `p` items, each extra item gains at most its row sum of
 * distances (largest: 170, for 42) while the penalty grows by at least P, so
 * any `P > 170` keeps every over-full set worse; 200 clears it.
 */
export const maxDiversity: ExtendedCase = {
  source: 'mentioned',
  id: 'max-diversity',
  section: '§1',
  pages: [3, 3],
  group: 'general',
  penalty: { paperValue: 200, min: 0, max: 400, step: 10 },
  editable: false,
  model: {
    sense: 'max',
    numVars: NUMBERS.length,
    varMeta: decisionVars(NUMBERS.length),
    linear: new Array<number>(NUMBERS.length).fill(0),
    quadratic: NUMBERS.flatMap((a, i) =>
      NUMBERS.slice(i + 1).map((b, k) => ({ i, j: i + 1 + k, coef: Math.abs(a - b) })),
    ),
    constraints: [
      unitRow(
        NUMBERS.length,
        NUMBERS.map((_, j) => j),
        '=',
        DIVERSITY_PICK,
        'transform1',
        `choose exactly ${DIVERSITY_PICK}`,
      ),
    ],
  },
};

/** Row and column sums of the 3×3 image in `discreteTomography`. */
export const TOMOGRAPHY_SUMS = { rows: [2, 1, 2], cols: [2, 1, 2] };

/**
 * Discrete Tomography, named in the §1 list (p.4): recover a 0/1 image from
 * its projections — here the row and column sums of a 3×3 grid.
 *
 * There is no objective; every projection is an equality closed with
 * Transformation #1, exactly like §5.2's node rows. Any positive P works, so P
 * is 1.
 *
 * The sums are those of an "X" (corners and centre). Exhaustive search finds
 * FIVE images with these projections, not one — the degeneracy on the
 * solutions tab is the point of the case: projections alone do not determine
 * the picture, which is the central difficulty of the real problem.
 */
export const discreteTomography: ExtendedCase = {
  source: 'mentioned',
  id: 'discrete-tomography',
  section: '§1',
  pages: [4, 4],
  group: 'general',
  penalty: { paperValue: 1, min: 0, max: 6, step: 1 },
  editable: false,
  model: {
    sense: 'min',
    numVars: 9,
    varMeta: labelledGrid(3, 3),
    linear: new Array<number>(9).fill(0),
    quadratic: [],
    constraints: [
      ...TOMOGRAPHY_SUMS.rows.map((r, i) =>
        unitRow(9, [0, 1, 2].map((c) => i * 3 + c), '=', r, 'transform1', `row ${i + 1} sum = ${r}`),
      ),
      ...TOMOGRAPHY_SUMS.cols.map((c, j) =>
        unitRow(9, [0, 1, 2].map((r) => r * 3 + j), '=', c, 'transform1', `column ${j + 1} sum = ${c}`),
      ),
    ],
  },
};

/** Execution cost of task i on processor k. */
export const TASK_EXEC = [
  [3, 8],
  [9, 2],
  [5, 6],
];

/** Communication cost paid when tasks i and j land on different processors. */
export const TASK_COMM: { i: number; j: number; cost: number }[] = [
  { i: 0, j: 1, cost: 2 },
  { i: 0, j: 2, cost: 5 },
  { i: 1, j: 2, cost: 2 },
];

/**
 * Task Allocation in distributed computer systems, named in the §1 list (p.3):
 * place each task on one processor, paying its execution cost there plus a
 * communication cost for every pair of tasks that ends up on different
 * processors. Uncapacitated, as in the Lewis et al. paper the bibliography cites.
 *
 * `x_{ik} = 1` puts task i on processor k. Communication between i and j is
 * `c_{ij}(x_{i1}x_{j2} + x_{i2}x_{j1})`, so the objective is quadratic; each
 * task's `Σ_k x_{ik} = 1` is Transformation #1.
 *
 * The costs are chosen so the two pulls disagree: running everything on one
 * processor would avoid all communication (best 16), but the optimum splits —
 * tasks 1 and 3 on processor 1, task 2 on processor 2, total 14, unique.
 *
 * P is ours. Unassigning a task saves at most its dearer execution cost plus
 * all its communication (largest: 8 + 2 + 5 = 15 for task 1), so `P > 15`
 * suffices; 16 is the smallest integer that does.
 */
export const taskAllocation: ExtendedCase = {
  source: 'mentioned',
  id: 'task-allocation',
  section: '§1',
  pages: [3, 3],
  group: 'general',
  penalty: { paperValue: 16, min: 0, max: 40, step: 1 },
  editable: false,
  model: {
    sense: 'min',
    numVars: 6,
    varMeta: labelledGrid(3, 2),
    linear: TASK_EXEC.flat(),
    quadratic: TASK_COMM.flatMap(({ i, j, cost }) => [
      { i: i * 2, j: j * 2 + 1, coef: cost },
      { i: i * 2 + 1, j: j * 2, coef: cost },
    ]),
    constraints: TASK_EXEC.map((_, i) =>
      unitRow(6, [i * 2, i * 2 + 1], '=', 1, 'transform1', `task ${i + 1}: exactly one processor`),
    ),
  },
};
