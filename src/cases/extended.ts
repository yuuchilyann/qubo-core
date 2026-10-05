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

import type { Clause, ExtendedCase, VarMeta } from '../types';
import { decisionVars, labelledGrid, neg, nonEdges, pos, row, sub, unitRow } from './helpers';
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

// ── batch 2: slack, mixed constraint types, node variables ────────────────

/** §5.5's four projects: linear values, and the resource use per budget period. */
export const PROJECT_VALUES = [2, 5, 2, 4];
export const BUDGET_ROWS = [
  { use: [8, 6, 5, 3], limit: 16 },
  { use: [3, 7, 4, 6], limit: 13 },
];

/**
 * Capital Budgeting, named in the §1 list (p.3) and by §5.5 itself ("project
 * selection and capital budgeting", p.29): choose projects to maximise total
 * value while every budget period stays within its limit.
 *
 * Linear objective, one `≤` row per period, each closed with a slack variable
 * and Transformation #1 — §5.5 without the quadratic terms and with a second
 * period. Period 1 is §5.5's own row (8, 6, 5, 3 ≤ 16) and the values are
 * §5.5's linear coefficients; period 2 is ours.
 *
 * With period 1 alone the best choice would be projects 2, 3, 4 for 11; period
 * 2 rules that out, and the optimum becomes projects 2 and 4 for 9, unique.
 *
 * The slack bounds are the full row ranges (16 and 13), not §5.5's judgement of
 * 3: the optimum leaves 7 unused in period 1, which a bound of 3 could not
 * represent. P is ours: an infeasible selection pays at least P and scores at
 * most 13 (every project), while choosing nothing is feasible and scores 0, so
 * `P > 13` suffices; 14 is the smallest integer that does.
 */
export const capitalBudgeting: ExtendedCase = {
  source: 'mentioned',
  id: 'capital-budgeting',
  section: '§1',
  pages: [3, 3],
  group: 'general',
  penalty: { paperValue: 14, min: 0, max: 30, step: 1 },
  editable: false,
  model: {
    sense: 'max',
    numVars: 4,
    varMeta: decisionVars(4),
    linear: [...PROJECT_VALUES],
    quadratic: [],
    constraints: BUDGET_ROWS.map(({ use, limit }, t) =>
      row([...use], '<=', limit, 'transform1', `period ${t + 1} budget`),
    ),
  },
};

/** Item weights (§5.5's resource row) and the two knapsack capacities. */
export const KNAPSACK_WEIGHTS = [8, 6, 5, 3];
export const KNAPSACK_CAPS = [10, 8];

/**
 * Multiple Knapsack, named in the §1 list (p.3): several knapsacks, each item
 * packed into at most one of them, every knapsack within its capacity.
 *
 * `x_{ik} = 1` puts item i in knapsack k. "At most one knapsack" is
 * `x_{i1} + x_{i2} ≤ 1`, row 1 of the p.10 table again (Transformation #2, no
 * slack); each capacity is a `≤` row closed with slack and Transformation #1. So
 * this one case uses both transformations, like §5.2.
 *
 * Items are §5.5's four projects (weights 8, 6, 5, 3; values 2, 5, 2, 4) and the
 * capacities 10 and 8 are ours. Total weight 22 exceeds the 18 available, so
 * something must stay out; the best value is 11, reached by four different
 * packings — that degeneracy is real, not an artefact of the slack bits.
 *
 * P is ours, by the same argument as `capitalBudgeting`: nothing packed is
 * feasible at 0 and no assignment scores above 13, so `P > 13`; 14.
 */
export const multipleKnapsack: ExtendedCase = {
  source: 'mentioned',
  id: 'multiple-knapsack',
  section: '§1',
  pages: [3, 3],
  group: 'general',
  penalty: { paperValue: 14, min: 0, max: 30, step: 1 },
  editable: false,
  model: {
    sense: 'max',
    numVars: 8,
    varMeta: labelledGrid(4, 2),
    linear: PROJECT_VALUES.flatMap((v) => [v, v]),
    quadratic: [],
    constraints: [
      ...KNAPSACK_WEIGHTS.map((_, i) =>
        unitRow(8, [i * 2, i * 2 + 1], '<=', 1, 'transform2', `item ${i + 1}: at most one knapsack`),
      ),
      ...KNAPSACK_CAPS.map((cap, k) =>
        row(
          KNAPSACK_WEIGHTS.flatMap((w) => (k === 0 ? [w, 0] : [0, w])),
          '<=',
          cap,
          'transform1',
          `knapsack ${k + 1} capacity`,
        ),
      ),
    ],
  },
};

/** Customers and candidate sites as points on a line; distance is |a − b|. */
export const FACILITY_CUSTOMERS = [0, 2, 7, 10];
export const FACILITY_SITES = [1, 5, 9];
/** Opening cost per site, for `warehouseLocation` only. */
export const FACILITY_OPEN_COST = [4, 1, 6];
const MEDIAN_P = 2;

const facilityDist = FACILITY_CUSTOMERS.map((c) => FACILITY_SITES.map((s) => Math.abs(c - s)));
const nCust = FACILITY_CUSTOMERS.length;
const nSite = FACILITY_SITES.length;
const nAssign = nCust * nSite;

/**
 * `x_{ij}` (customer i served by site j), row-major, THEN `y_j` (site j open).
 *
 * The order matters: the `implication` recipe takes its two variables in index
 * order as `antecedent ≤ consequent`, so every `x_{ij}` must precede its `y_j`.
 * Get it backwards and the constrained-search check fails, which is how such a
 * slip would surface.
 */
function facilityVars(): VarMeta[] {
  return [
    ...labelledGrid(nCust, nSite),
    ...FACILITY_SITES.map((_, j) => ({
      name: `x${sub(nAssign + j + 1)}`,
      kind: 'decision' as const,
      origin: `y${sub(j + 1)}`,
    })),
  ];
}

/** Each customer served exactly once, and only by an open site. */
function facilityRows() {
  const n = nAssign + nSite;
  return [
    ...FACILITY_CUSTOMERS.map((_, i) =>
      unitRow(
        n,
        FACILITY_SITES.map((_, j) => i * nSite + j),
        '=',
        1,
        'transform1',
        `customer ${i + 1}: served by exactly one site`,
      ),
    ),
    ...FACILITY_CUSTOMERS.flatMap((_, i) =>
      FACILITY_SITES.map((_, j) => {
        const coeffs = new Array<number>(n).fill(0);
        coeffs[i * nSite + j] = 1;
        coeffs[nAssign + j] = -1;
        return row(coeffs, '<=', 0, 'implication', `customer ${i + 1} → site ${j + 1} only if open`);
      }),
    ),
  ];
}

/**
 * P-Median, named in the §1 list (p.3): open exactly p sites and serve every
 * customer from its nearest open one, minimising total distance.
 *
 * Three kinds of row in one model: "served exactly once" and "exactly p open"
 * are Transformation #1; "served only by an open site", `x_{ij} ≤ y_j`, is row 4
 * of the p.10 table, `P(x_{ij} − x_{ij}y_j)`.
 *
 * Four customers at 0, 2, 7, 10 and three sites at 1, 5, 9, p = 2. Opening the
 * two outer sites wins, total 5, unique.
 *
 * P is ours. Distances are non-negative and every violated row costs at least
 * P, so any P above the cost of SOME feasible plan works; opening sites 1 and 2
 * costs 9, so `P > 9`; 10.
 */
export const pMedian: ExtendedCase = {
  source: 'mentioned',
  id: 'p-median',
  section: '§1',
  pages: [3, 3],
  group: 'general',
  penalty: { paperValue: 10, min: 0, max: 30, step: 1 },
  editable: false,
  model: {
    sense: 'min',
    numVars: nAssign + nSite,
    varMeta: facilityVars(),
    linear: [...facilityDist.flat(), ...new Array<number>(nSite).fill(0)],
    quadratic: [],
    constraints: [
      ...facilityRows(),
      unitRow(
        nAssign + nSite,
        FACILITY_SITES.map((_, j) => nAssign + j),
        '=',
        MEDIAN_P,
        'transform1',
        `open exactly ${MEDIAN_P} sites`,
      ),
    ],
  },
};

/**
 * Warehouse Location (uncapacitated facility location), named in the §1 list
 * (p.4): like P-Median, but each site has an opening cost and there is no
 * fixed number to open — the model decides how many.
 *
 * Same customers, sites and rows as `pMedian`, minus the cardinality row, plus
 * the opening costs 4, 1, 6 on the `y` variables. The cheap middle site now
 * changes the answer: open sites 1 and 2, total 14, unique — where P-Median on
 * the same points opened sites 1 and 3.
 *
 * P is ours, by the same argument: opening every site is feasible at 16, so
 * `P > 16`; 17.
 *
 * Cross-check against the source of the §1 list. Kochenberger & Glover (2006,
 * §5.1, "Warehouse Location: Single source, Uncapacitated") recast
 * `x_{ij} ≤ y_i` by complementing `y` and applying Transformation #2 to
 * `x_{ij} + ȳ_i ≤ 1`, giving `P·x_{ij}(1 − y_i)`. That is `P(x_{ij} − x_{ij}y_i)`,
 * the p.10 row-4 penalty used here, term for term — and, as they note, "no new
 * variables required". Their instances are random (`c_ij = U(50, 100)`,
 * `f_i = U(100, 200)`, P = 200), so only the recipe can be compared, not numbers.
 */
export const warehouseLocation: ExtendedCase = {
  source: 'mentioned',
  id: 'warehouse-location',
  section: '§1',
  pages: [4, 4],
  group: 'general',
  penalty: { paperValue: 17, min: 0, max: 40, step: 1 },
  editable: false,
  model: {
    sense: 'min',
    numVars: nAssign + nSite,
    varMeta: facilityVars(),
    linear: [...facilityDist.flat(), ...FACILITY_OPEN_COST],
    quadratic: [],
    constraints: facilityRows(),
  },
};

/**
 * Pairwise preferences among four items: `ORDERING_VOTES[i][j]` of five voters
 * rank item i+1 above item j+1, so each pair sums to 5.
 */
export const ORDERING_VOTES = [
  [0, 4, 4, 1],
  [1, 0, 4, 3],
  [1, 1, 0, 2],
  [4, 2, 3, 0],
];
const ORDER_PAIRS: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];
const pairIndex = (i: number, j: number) => ORDER_PAIRS.findIndex(([a, b]) => a === i && b === j);

/**
 * Linear Ordering, named in the §1 list (p.4): rank items so that as many
 * pairwise preferences as possible agree with the ranking.
 *
 * One variable per pair `i < j`: `x_{ij} = 1` puts i ahead of j. A ranking is a
 * set of such choices with no cycle, which for every triple `i < j < k` is
 * `0 ≤ x_{ij} + x_{jk} − x_{ik} ≤ 1` — two rows, each closed with slack.
 *
 * Each slack bound is 1, below the row's full range of 2. That is a judgement
 * in exactly the sense of §5.3 (p.25): whenever the OTHER row of the pair holds,
 * this row's slack cannot exceed 1, so a larger bound would only add bits. The
 * constrained search, which knows nothing of slack, confirms the judgement
 * loses no feasible ranking.
 *
 * The objective counts NET agreement, `Σ (w_{ij} − w_{ji}) x_{ij}`. The full
 * agreement count adds the constant `Σ_{i<j} w_{ji} = 12`, which a constrained
 * model has no place for; the problem view adds it back. The majorities are
 * cyclic (1 over 2, 2 over 4, 4 over 1), so transitivity binds; the best
 * ranking is 4, 1, 2, 3 with net 9 (agreement 21 of 30), unique.
 *
 * P is ours. No assignment scores above 10 (all positive nets) and the plain
 * order 1, 2, 3, 4 is feasible at 6, so `P > 4`; 5.
 */
export const linearOrdering: ExtendedCase = {
  source: 'mentioned',
  id: 'linear-ordering',
  section: '§1',
  pages: [4, 4],
  group: 'general',
  penalty: { paperValue: 5, min: 0, max: 20, step: 1 },
  editable: false,
  model: {
    sense: 'max',
    numVars: ORDER_PAIRS.length,
    varMeta: ORDER_PAIRS.map(([i, j], k) => ({
      name: `x${sub(k + 1)}`,
      kind: 'decision' as const,
      origin: `x${sub(i + 1)}${sub(j + 1)}`,
    })),
    linear: ORDER_PAIRS.map(([i, j]) => ORDERING_VOTES[i][j] - ORDERING_VOTES[j][i]),
    quadratic: [],
    constraints: [
      [0, 1, 2],
      [0, 1, 3],
      [0, 2, 3],
      [1, 2, 3],
    ].flatMap(([i, j, k]) => {
      const coeffs = new Array<number>(ORDER_PAIRS.length).fill(0);
      coeffs[pairIndex(i, j)] = 1;
      coeffs[pairIndex(j, k)] = 1;
      coeffs[pairIndex(i, k)] = -1;
      const t = `${i + 1},${j + 1},${k + 1}`;
      return [
        row([...coeffs], '<=', 1, 'transform1', `triple (${t}): no cycle, upper`, 1),
        row([...coeffs], '>=', 0, 'transform1', `triple (${t}): no cycle, lower`, 1),
      ];
    }),
  },
};

/** Signed similarity between four nodes; positive wants them together. */
export const CLUSTER_WEIGHTS: { i: number; j: number; w: number }[] = [
  { i: 0, j: 1, w: 4 },
  { i: 0, j: 2, w: -2 },
  { i: 0, j: 3, w: -3 },
  { i: 1, j: 2, w: 2 },
  { i: 1, j: 3, w: -1 },
  { i: 2, j: 3, w: 3 },
];
const CLUSTER_NODES = 4;

/**
 * Clique Partitioning, named in the §1 list (p.4) and the one problem §7
 * (point 3, p.36) uses to motivate replacing edge variables by node variables.
 *
 * Split the nodes into any number of groups, maximising the total weight of the
 * pairs that share a group. The standard model has one variable per EDGE; §7's
 * substitution replaces "i and j together" with `Σ_k x_{ik}x_{jk}`, where
 * `x_{ik} = 1` puts node i in group k. The objective becomes quadratic and the
 * only rows are "each node in exactly one group", Transformation #1.
 *
 * Four groups for four nodes, so no partition is excluded. The best is
 * {1, 2} {3, 4}, total 7; it appears as 12 optima because the group labels are
 * interchangeable (4 × 3 ways to name two groups) — a symmetry worth seeing.
 *
 * P is ours. Leaving a node out gains at most its negative weights; putting it
 * in m groups gains at most (m − 1) times its positive weights while costing
 * P(m − 1)². Either way P above the node's total |weight| suffices; the
 * largest is 9 (node 1), so 10.
 */
export const cliquePartitioning: ExtendedCase = {
  source: 'mentioned',
  id: 'clique-partitioning',
  section: '§1',
  pages: [4, 4],
  group: 'general',
  penalty: { paperValue: 10, min: 0, max: 30, step: 1 },
  editable: false,
  model: {
    sense: 'max',
    numVars: CLUSTER_NODES * CLUSTER_NODES,
    varMeta: labelledGrid(CLUSTER_NODES, CLUSTER_NODES),
    linear: new Array<number>(CLUSTER_NODES * CLUSTER_NODES).fill(0),
    quadratic: CLUSTER_WEIGHTS.flatMap(({ i, j, w }) =>
      Array.from({ length: CLUSTER_NODES }, (_, k) => ({
        i: i * CLUSTER_NODES + k,
        j: j * CLUSTER_NODES + k,
        coef: w,
      })),
    ),
    constraints: Array.from({ length: CLUSTER_NODES }, (_, i) =>
      unitRow(
        CLUSTER_NODES * CLUSTER_NODES,
        Array.from({ length: CLUSTER_NODES }, (_, k) => i * CLUSTER_NODES + k),
        '=',
        1,
        'transform1',
        `node ${i + 1}: exactly one group`,
      ),
    ),
  },
};

// ── batch 3: clauses of three literals, and the higher-order reduction ─────

/**
 * Max 3-SAT, from "SAT problems" in the §1 list (p.4): satisfy as many
 * three-literal clauses as possible.
 *
 * §4.3's construction carries over unchanged — a clause's penalty is the
 * product of its "is false" indicators — but with three literals that product
 * is CUBIC. Summed over the eight clauses, two cubic terms survive, `−x₁x₂x₃`
 * and `−x₁x₂x₄`. Both contain `x₁x₂`, so §7 point 4's Rosenberg reduction
 * replaces that one product by a single auxiliary `x₅` with the penalty
 * `P(x₁x₂ − 2x₁x₅ − 2x₂x₅ + 3x₅)`, and the QUBO is 5×5.
 *
 * The formula has exactly one satisfying assignment, `x₁ = 1` and the rest 0,
 * so the optimum is 0 unsatisfied clauses, unique.
 *
 * P is ours and is the REDUCTION penalty — the clauses are the objective and
 * never scale with it. If `x₅ ≠ x₁x₂`, the two substituted terms are off by at
 * most 1 + 1 = 2, so `P > 2` keeps the optimum exact; 3.
 */
export const SAT3_CLAUSES: Clause[] = [
  [pos(2), neg(3), pos(4)],
  [neg(1), neg(3), neg(4)],
  [neg(2), neg(3), pos(4)],
  [pos(2), pos(3), neg(4)],
  [pos(1), pos(3), pos(4)],
  [neg(1), neg(2), pos(3)],
  [pos(2), neg(3), neg(4)],
  [pos(1), neg(2), neg(4)],
];

export const max3Sat: ExtendedCase = {
  source: 'mentioned',
  id: 'max-3-sat',
  section: '§1',
  pages: [4, 4],
  group: 'knownPenalty',
  penalty: { paperValue: 3, min: 0, max: 8, step: 1 },
  editable: false,
  model: {
    sense: 'min', // minimise the number of UNSATISFIED clauses
    numVars: 4,
    varMeta: decisionVars(4),
    linear: [0, 0, 0, 0],
    quadratic: [],
    constraints: [],
    clauses: SAT3_CLAUSES,
  },
};

/** Six people, and the trios that must each be split across the two teams. */
export const NAE_TRIPLES: [number, number, number][] = [
  [1, 2, 3],
  [1, 2, 4],
  [1, 5, 6],
  [2, 5, 6],
  [3, 4, 5],
  [3, 4, 6],
];

/**
 * A Constraint Satisfaction Problem, named in the §1 list (p.4): split six
 * people into two teams so that no listed trio ends up entirely on one team —
 * "not all equal", also known as set splitting or hypergraph 2-colouring.
 *
 * A not-all-equal constraint on `(a, b, c)` is two clauses, `(a ∨ b ∨ c)` and
 * `(¬a ∨ ¬b ∨ ¬c)`; a monochromatic trio violates exactly one of them, so the
 * objective counts violated trios. Each clause alone is cubic, but the pair's
 * cubic terms are `−xₐx_bx_c` and `+xₐx_bx_c`: they CANCEL, and the constraint
 * is quadratic in total — `1 − a − b − c + ab + ac + bc`. Because `derive()`
 * sums every clause before reducing, no auxiliary variable is created. The
 * contrast with `max3Sat` is the point.
 *
 * Eight team assignments satisfy every trio (four, up to swapping the team
 * names), so the optimum 0 appears with degeneracy 8. No penalty is needed:
 * there are no constraints and nothing to reduce.
 *
 * NOT the formulation the authors themselves used. Kochenberger & Glover (2006,
 * §5.2), the source of the §1 list, treat CSPs as linear equality systems
 * `Ax = b` with `a_ij ∈ {−1, 0, 1}` and `b_i ∈ {1, 2}`, recast with
 * Transformation #1 at P = 2 and no new variables. Not-all-equal is a CSP too,
 * but it is a different one, chosen here because the cancellation is a lesson
 * `max3Sat` alone cannot teach. Their instances are random, so there is no
 * published one to reproduce in either form.
 */
export const constraintSatisfaction: ExtendedCase = {
  source: 'mentioned',
  id: 'constraint-satisfaction',
  section: '§1',
  pages: [4, 4],
  group: 'knownPenalty',
  penalty: null,
  editable: false,
  model: {
    sense: 'min', // minimise the number of violated clauses = monochromatic trios
    numVars: 6,
    varMeta: decisionVars(6),
    linear: new Array<number>(6).fill(0),
    quadratic: [],
    constraints: [],
    clauses: NAE_TRIPLES.flatMap(([a, b, c]) => [
      [pos(a), pos(b), pos(c)],
      [neg(a), neg(b), neg(c)],
    ]),
  },
};

// ── batch 4: problems the paper cites in §6 ────────────────────────────────
// Not in the §1 list: §6 names them only as subjects of work it cites, so each
// case carries `mention: 'cited'` and the page says so.

/**
 * Graph Partitioning, cited in §6 (p.32: "graph partitioning problems in
 * Mniszewski et al. (2016) and Ushijima-Mwesigwa et al. (2017)").
 *
 * Split the nodes into two groups of fixed size and cut as FEW edges as
 * possible — Max-Cut turned around, plus a balance row. The cut count is
 * `Σ_{(i,j)∈E} (xᵢ + xⱼ − 2xᵢxⱼ)`, written out as linear and quadratic terms
 * because this objective is minimised; the size row `Σxⱼ = 2` is
 * Transformation #1.
 *
 * §3.2's graph again, so the page can be read against Max-Cut: maximising the
 * cut gives 5, minimising it with groups of 2 and 3 gives 2 — {1, 2} against
 * the triangle {3, 4, 5}, unique. With five nodes the halves cannot be equal,
 * so "as balanced as possible" is the honest reading.
 *
 * P is ours. The objective is non-negative and a violated size row costs at
 * least P, so P above the cost of any feasible split works; nodes 1 and 2
 * together cut 2 edges, so `P > 2`; 3.
 */
const PARTITION_SIZE = 2;
const tutorialDegree = TUTORIAL_GRAPH.nodes.map(
  (v) => TUTORIAL_GRAPH.edges.filter(([a, b]) => a === v || b === v).length,
);

export const graphPartitioning: ExtendedCase = {
  source: 'mentioned',
  mention: 'cited',
  id: 'graph-partitioning',
  section: '§6',
  pages: [32, 32],
  group: 'general',
  penalty: { paperValue: 3, min: 0, max: 10, step: 1 },
  editable: false,
  graph: TUTORIAL_GRAPH,
  model: {
    sense: 'min',
    numVars: 5,
    varMeta: decisionVars(5),
    linear: tutorialDegree,
    quadratic: TUTORIAL_GRAPH.edges.map(([a, b]) => ({ i: a - 1, j: b - 1, coef: -2 })),
    constraints: [
      unitRow(5, [0, 1, 2, 3, 4], '=', PARTITION_SIZE, 'transform1', `group 1 has exactly ${PARTITION_SIZE} nodes`),
    ],
  },
};

/** Expected return per asset, and the covariance matrix (integer, positive definite). */
export const PORTFOLIO_RETURNS = [8, 12, 6, 10, 9];
export const PORTFOLIO_COV = [
  [7, 8, 2, 3, 3],
  [8, 17, 3, 4, 5],
  [2, 3, 2, 2, 1],
  [3, 4, 2, 7, 1],
  [3, 5, 1, 1, 4],
];
const PORTFOLIO_PICK = 3;

/**
 * Portfolio selection, cited in §6 (p.32: "financial portfolio management
 * problems in Elsokkary et al. (2017) and Kalra et al. (2018)").
 *
 * Binary Markowitz: hold exactly k assets, minimising risk minus return,
 * `xᵀΣx − μᵀx`. The objective is already quadratic — its diagonal is
 * `σᵢᵢ − μᵢ` and each pair contributes `2σᵢⱼ` — and the only row is the
 * cardinality `Σxⱼ = k`, Transformation #1. Risk and return are weighted
 * equally; the weight is a modelling choice, not data.
 *
 * Kochenberger & Ma's own white paper on portfolio QUBOs (2019, in the
 * bibliography) is not public, so this is the textbook form, not theirs.
 *
 * Five assets, hold three. The highest-return trio, assets 2, 4 and 5 (31),
 * carries too much risk; the optimum is assets 3, 4 and 5, objective −4,
 * unique. The size row genuinely binds: without it the best holding would be
 * just assets 3 and 5 (−7). An earlier draft asked for two assets, and that
 * unconstrained optimum satisfied the row by accident — the case then passed
 * even at P = 0, which taught nothing about the penalty.
 *
 * P is ours. A violated row costs at least P. No assignment scores below
 * −13 (the sum of the negative diagonal entries; every covariance is
 * positive), and the first three assets together are feasible at 26, so
 * `P > 39`; 40.
 */
export const portfolio: ExtendedCase = {
  source: 'mentioned',
  mention: 'cited',
  id: 'portfolio',
  section: '§6',
  pages: [32, 32],
  group: 'general',
  penalty: { paperValue: 40, min: 0, max: 80, step: 1 },
  editable: false,
  model: {
    sense: 'min',
    numVars: 5,
    varMeta: decisionVars(5),
    linear: PORTFOLIO_RETURNS.map((m, i) => PORTFOLIO_COV[i][i] - m),
    quadratic: PORTFOLIO_COV.flatMap((rowv, i) =>
      rowv.slice(i + 1).map((s, k) => ({ i, j: i + 1 + k, coef: 2 * s })),
    ),
    constraints: [
      unitRow(5, [0, 1, 2, 3, 4], '=', PORTFOLIO_PICK, 'transform1', `hold exactly ${PORTFOLIO_PICK} assets`),
    ],
  },
};

/** Edge weights on §3.2's graph, in `TUTORIAL_GRAPH.edges` order. */
export const MATCHING_WEIGHTS = [4, 2, 3, 5, 1, 2];

/**
 * Maximum Weight Matching, cited in §6 (p.31: Lucas (2014) converts
 * "matching ... problems" among others into Ising form).
 *
 * One variable per EDGE: `x_e = 1` puts edge e in the matching. Every node may
 * touch at most one chosen edge, `Σ_{e∋v} x_e ≤ 1` — row 1 of the p.10 table
 * for a node of degree 2, and the general form (row 5) for nodes 3 and 4,
 * which have three edges each. Transformation #2, no slack.
 *
 * §3.2's graph with weights 4, 2, 3, 5, 1, 2 on its six edges. The best
 * matching is {1–2, 3–4}, weight 9, unique; the triangle 3–4–5 means no
 * matching can cover all five nodes.
 *
 * P is ours. Adding an edge that clashes gains at most the largest weight, 5,
 * while each clashing pair costs P, so `P > 5`; 6.
 */
export const maxMatching: ExtendedCase = {
  source: 'mentioned',
  mention: 'cited',
  id: 'max-matching',
  section: '§6',
  pages: [31, 31],
  group: 'knownPenalty',
  penalty: { paperValue: 6, min: 0, max: 15, step: 1 },
  editable: false,
  graph: TUTORIAL_GRAPH,
  model: {
    sense: 'max',
    numVars: TUTORIAL_GRAPH.edges.length,
    varMeta: TUTORIAL_GRAPH.edges.map(([a, b], k) => ({
      name: `x${sub(k + 1)}`,
      kind: 'decision' as const,
      origin: `x${sub(a)}${sub(b)}`,
    })),
    linear: [...MATCHING_WEIGHTS],
    quadratic: [],
    constraints: TUTORIAL_GRAPH.nodes.map((v) =>
      unitRow(
        TUTORIAL_GRAPH.edges.length,
        TUTORIAL_GRAPH.edges.flatMap(([a, b], k) => (a === v || b === v ? [k] : [])),
        '<=',
        1,
        'transform2',
        `node ${v}: at most one matched edge`,
      ),
    ),
  },
};
