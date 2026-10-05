/** The case catalogue, ordered the way the paper builds its argument. */

import type { CaseGroup, CatalogCase, ExtendedCase, QuboCase } from '../types';
import {
  capitalBudgeting,
  cliquePartitioning,
  discreteTomography,
  linearOrdering,
  maxClique,
  maxDiversity,
  maxIndependentSet,
  multipleKnapsack,
  pMedian,
  taskAllocation,
  warehouseLocation,
} from './extended';
import { helloWorld, maxCut, numberPartitioning } from './natural';
import { max2Sat, minVertexCover, setPacking } from './knownPenalty';
import {
  general01,
  graphColoring,
  qap,
  quadraticKnapsack,
  setPartitioning,
} from './general';

export { TUTORIAL_GRAPH, NUMBERS } from './natural';
export { COLORING_GRAPH } from './general';
export {
  BUDGET_ROWS,
  CLUSTER_WEIGHTS,
  FACILITY_CUSTOMERS,
  FACILITY_OPEN_COST,
  FACILITY_SITES,
  KNAPSACK_CAPS,
  KNAPSACK_WEIGHTS,
  ORDERING_VOTES,
  PROJECT_VALUES,
  TASK_COMM,
  TASK_EXEC,
  TOMOGRAPHY_SUMS,
} from './extended';
export { helloWorld };

/**
 * The paper's eleven worked examples — every element carries a `paperQ`.
 *
 * `helloWorld` is listed here too so the verification harness covers all eleven
 * cases, but the app gives it its own onboarding tab rather than filing it under
 * a group.
 *
 * Kept to worked examples only: consumers iterate this list and read `paperQ`
 * off every element, so a case without one does not belong here.
 */
export const ALL_CASES: QuboCase[] = [
  helloWorld,
  numberPartitioning,
  maxCut,
  minVertexCover,
  setPacking,
  max2Sat,
  setPartitioning,
  graphColoring,
  general01,
  qap,
  quadraticKnapsack,
];

/** Problems the paper names without working them; see `cases/extended.ts`. */
export const EXTENDED_CASES: ExtendedCase[] = [
  maxIndependentSet,
  maxClique,
  maxDiversity,
  discreteTomography,
  taskAllocation,
  capitalBudgeting,
  multipleKnapsack,
  pMedian,
  warehouseLocation,
  linearOrdering,
  cliquePartitioning,
];

/** Everything the site can show: the worked examples, then the extensions. */
export const CATALOG: CatalogCase[] = [...ALL_CASES, ...EXTENDED_CASES];

/** Cases shown under the three group tabs (everything except the Hello World). */
export const GROUPED_CASES: CatalogCase[] = CATALOG.filter((c) => c.id !== 'hello-world');

export const GROUP_ORDER: CaseGroup[] = ['natural', 'knownPenalty', 'general'];

export function casesInGroup(group: CaseGroup): CatalogCase[] {
  return GROUPED_CASES.filter((c) => c.group === group);
}

export function findCase(id: string): CatalogCase | undefined {
  return CATALOG.find((c) => c.id === id);
}

/**
 * Linear walk order for the presenter's prev/next controls: each group's
 * intro page, then its cases, so a straight run through the site follows the
 * same arc as reading the paper front to back.
 */
export const WALK_ORDER: string[] = [
  'overview',
  'hello-world',
  ...GROUP_ORDER.flatMap((g) => [`group:${g}`, ...casesInGroup(g).map((c) => c.id)]),
  'appendix',
];
