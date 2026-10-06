/**
 * The graph a QUBO asks the hardware to realise: one node per variable, one
 * edge per pair the objective couples.
 *
 * The edge test is `Q[i][j] + Q[j][i] ≠ 0`, exact. Summing both halves makes it
 * independent of whether Q is stored symmetric or upper-triangular, and an exact
 * test is what lets a cancellation show: the CSP case's cubic terms cancel
 * pairwise, and a coupling that cancels to zero needs no coupler. Every Q this
 * library derives is built from integers and halves, so cancellation is exact.
 *
 * Diagonal entries are linear terms; they sit on a single qubit and need no
 * coupler, so they never make an edge. A variable with no edges is still a node:
 * it needs a qubit of its own.
 */

export type ProblemGraph = {
  n: number;
  /** `[i, j]` with `i < j`, ascending. */
  edges: [number, number][];
};

export function problemGraph(Q: number[][]): ProblemGraph {
  const n = Q.length;
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) if (Q[i][j] + Q[j][i] !== 0) edges.push([i, j]);
  return { n, edges };
}

/** Fraction of the `n(n−1)/2` possible couplings the QUBO uses. */
export function density(g: ProblemGraph): number {
  const pairs = (g.n * (g.n - 1)) / 2;
  return pairs ? g.edges.length / pairs : 0;
}
