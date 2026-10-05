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
import { decisionVars, unitRow } from './helpers';
import { TUTORIAL_GRAPH } from './natural';

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
