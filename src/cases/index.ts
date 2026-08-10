/** The case catalogue, ordered the way the paper builds its argument. */

import type { CaseGroup, QuboCase } from '../types';
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
export { helloWorld };

/**
 * `helloWorld` is listed here too so the verification harness covers all eleven
 * cases, but the app gives it its own onboarding tab rather than filing it under
 * a group.
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

/** Cases shown under the three group tabs (everything except the Hello World). */
export const GROUPED_CASES: QuboCase[] = ALL_CASES.filter((c) => c.id !== 'hello-world');

export const GROUP_ORDER: CaseGroup[] = ['natural', 'knownPenalty', 'general'];

export function casesInGroup(group: CaseGroup): QuboCase[] {
  return GROUPED_CASES.filter((c) => c.group === group);
}

export function findCase(id: string): QuboCase | undefined {
  return ALL_CASES.find((c) => c.id === id);
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
