/**
 * Checks that a set of chains is a valid minor embedding.
 *
 * Deliberately independent of `embed.ts`: it imports only types, and rebuilds
 * its own adjacency from the edge list. A bug in the search therefore cannot
 * also hide in the check — the same separation `solveConstrained` keeps from
 * `derive()`.
 *
 * The four conditions are the definition, nothing more:
 *
 *   1. every variable has a non-empty chain of qubits that exist in the target;
 *   2. no qubit belongs to two chains;
 *   3. each chain is connected using couplers between its own qubits;
 *   4. for every edge (i, j) of the problem graph, some coupler joins a qubit
 *      of chain i to a qubit of chain j.
 */

import type { HardwareGraph } from './pegasus';
import type { ProblemGraph } from './problemGraph';

export type EmbeddingCheck = { ok: boolean; problems: string[] };

export function checkEmbedding(
  source: ProblemGraph,
  target: HardwareGraph,
  chains: number[][],
): EmbeddingCheck {
  const problems: string[] = [];
  const exists = new Set(target.nodes);
  const coupled = new Set(target.edges.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`));
  const isCoupler = (a: number, b: number) => coupled.has(`${Math.min(a, b)},${Math.max(a, b)}`);

  if (chains.length !== source.n) {
    problems.push(`expected ${source.n} chains, got ${chains.length}`);
    return { ok: false, problems };
  }

  // 1 and 2.
  const owner = new Map<number, number>();
  chains.forEach((chain, i) => {
    if (chain.length === 0) problems.push(`x${i + 1}: empty chain`);
    for (const q of chain) {
      if (!exists.has(q)) problems.push(`x${i + 1}: qubit ${q} is not in the target`);
      const other = owner.get(q);
      if (other !== undefined && other !== i) {
        problems.push(`qubit ${q} is in the chains of both x${other + 1} and x${i + 1}`);
      }
      owner.set(q, i);
    }
  });

  // 3. Breadth-first search inside the chain.
  chains.forEach((chain, i) => {
    if (chain.length < 2) return;
    const members = new Set(chain);
    const reached = new Set([chain[0]]);
    const queue = [chain[0]];
    while (queue.length) {
      const q = queue.pop()!;
      for (const r of members) {
        if (!reached.has(r) && isCoupler(q, r)) {
          reached.add(r);
          queue.push(r);
        }
      }
    }
    if (reached.size !== members.size) {
      problems.push(`x${i + 1}: chain is not connected (${reached.size} of ${members.size} qubits reachable)`);
    }
  });

  // 4.
  for (const [i, j] of source.edges) {
    const found = chains[i]?.some((a) => chains[j]?.some((b) => isCoupler(a, b)));
    if (!found) problems.push(`no coupler between the chains of x${i + 1} and x${j + 1}`);
  }

  return { ok: problems.length === 0, problems };
}
