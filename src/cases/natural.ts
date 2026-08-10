/**
 * §2 and §3 — models that land in QUBO form without any penalty machinery.
 *
 * Every `paperQ` / `paperSolution` below is transcribed from the PDF and is used
 * only as the reconciliation target; the Q the app actually shows is derived.
 */

import type { Graph, QuboCase } from '../types';
import { decisionVars, edges1, row } from './helpers';

/** The 5-node, 6-edge graph shared by §3.2 (Max-Cut) and §4.1 (Min Vertex Cover). */
export const TUTORIAL_GRAPH: Graph = {
  nodes: [1, 2, 3, 4, 5],
  edges: [
    [1, 2],
    [1, 3],
    [2, 4],
    [3, 4],
    [3, 5],
    [4, 5],
  ],
};

/**
 * §2, p.5 — the tutorial's own warm-up. No constraints, no penalty, no slack:
 * purely "here is what `xᵀQx` means".
 */
export const helloWorld: QuboCase = {
  id: 'hello-world',
  section: '§2',
  pages: [5, 5],
  group: 'natural',
  penalty: null,
  editable: true,
  model: {
    sense: 'min',
    numVars: 4,
    varMeta: decisionVars(4),
    // −5x₁ − 3x₂ − 8x₃ − 6x₄
    linear: [-5, -3, -8, -6],
    // + 4x₁x₂ + 8x₁x₃ + 2x₂x₃ + 10x₃x₄
    quadratic: [
      { i: 0, j: 1, coef: 4 },
      { i: 0, j: 2, coef: 8 },
      { i: 1, j: 2, coef: 2 },
      { i: 2, j: 3, coef: 10 },
    ],
    constraints: [],
  },
  paperQ: [
    [-5, 2, 4, 0],
    [2, -3, 1, 0],
    [4, 1, -8, 5],
    [0, 0, 5, -6],
  ],
  paperConstant: 0,
  paperSolution: { x: [1, 0, 0, 1], yQubo: -11, yOriginal: -11 },
};

/**
 * §3.1, pp.6–7 — Number Partitioning.
 *
 * The paper derives Q from `diff²` by hand. That derivation is exactly
 * Transformation #1 applied to the balance equation `Σ sⱼxⱼ = c/2` at `P = 1`:
 * the diagonal becomes `sⱼ² − c·sⱼ = sⱼ(sⱼ − c)` and the off-diagonals `sᵢsⱼ`,
 * which is precisely what p.7 prints. Expressing it this way keeps the case on
 * the same general engine as everything else.
 */
export const NUMBERS = [25, 7, 13, 31, 42, 17, 21, 10];
const C_SUM = NUMBERS.reduce((a, b) => a + b, 0); // 166

export const numberPartitioning: QuboCase = {
  id: 'number-partitioning',
  section: '§3.1',
  pages: [6, 7],
  group: 'natural',
  penalty: null,
  editable: true,
  model: {
    sense: 'min',
    numVars: NUMBERS.length,
    varMeta: decisionVars(NUMBERS.length),
    linear: new Array<number>(NUMBERS.length).fill(0),
    quadratic: [],
    constraints: [
      row([...NUMBERS], '=', C_SUM / 2, 'transform1', 'balance'),
    ],
  },
  paperQ: [
    [-3525, 175, 325, 775, 1050, 425, 525, 250],
    [175, -1113, 91, 217, 294, 119, 147, 70],
    [325, 91, -1989, 403, 546, 221, 273, 130],
    [775, 217, 403, -4185, 1302, 527, 651, 310],
    [1050, 294, 546, 1302, -5208, 714, 882, 420],
    [425, 119, 221, 527, 714, -2533, 357, 170],
    [525, 147, 273, 651, 882, 357, -3045, 210],
    [250, 70, 130, 310, 420, 170, 210, -1560],
  ],
  // (c/2)² = 83² — the paper drops this along with the factor of 4.
  paperConstant: 6889,
  paperSolution: { x: [0, 0, 0, 1, 1, 0, 0, 1], yQubo: -6889, yOriginal: 0 },
};

/**
 * §3.2, pp.7–9 — Max-Cut.
 *
 * `xᵢ + xⱼ − 2xᵢxⱼ` equals 1 exactly when the edge's endpoints land in
 * different sets, so summing it over E gives the cut size directly.
 */
export const maxCut: QuboCase = {
  id: 'max-cut',
  section: '§3.2',
  pages: [7, 9],
  group: 'natural',
  penalty: null,
  editable: true,
  graph: TUTORIAL_GRAPH,
  model: {
    sense: 'max',
    numVars: 5,
    varMeta: decisionVars(5),
    linear: [0, 0, 0, 0, 0],
    quadratic: [],
    constraints: [],
    cutEdges: edges1(TUTORIAL_GRAPH.edges),
  },
  paperQ: [
    [2, -1, -1, 0, 0],
    [-1, 2, 0, -1, 0],
    [-1, 0, 3, -1, -1],
    [0, -1, -1, 3, -1],
    [0, 0, -1, -1, 2],
  ],
  paperConstant: 0,
  paperSolution: { x: [0, 1, 1, 0, 0], yQubo: 5, yOriginal: 5 },
};
