/**
 * Checks for the hardware module, run by `npm run verify:embed`.
 *
 *   1. `pegasusGraph(m)` and `pegasusLayout` reproduce `dwave_networkx` exactly:
 *      same qubits, same couplers, positions within 1e−9. The reference is a
 *      fixture written by `scripts/gen-pegasus-fixture.py`, so no Ocean install
 *      is needed to run this.
 *   2. Every catalogue case, at its default input and P, embeds into some
 *      Pegasus fragment, and the result passes `checkEmbedding`. The checker
 *      shares no code with the search.
 */

import { CATALOG } from '../cases';
import { derive } from '../derive';
import { checkEmbedding } from '../hardware/checkEmbedding';
import { embeddingStats, findPegasusEmbedding } from '../hardware/embed';
import { pegasusGraph, pegasusLayout } from '../hardware/pegasus';
import { density, problemGraph } from '../hardware/problemGraph';
import type { CheckResult } from './harness';

export type PegasusFixture = {
  generator: string;
  m: number;
  nodes: number[];
  edges: [number, number][];
  pos: Record<string, [number, number]>;
};

const POS_TOLERANCE = 1e-9;

export function verifyPegasus(fixtures: PegasusFixture[]): CheckResult[] {
  return fixtures.flatMap((fx): CheckResult[] => {
    const g = pegasusGraph(fx.m);
    const sameNodes =
      g.nodes.length === fx.nodes.length && g.nodes.every((v, i) => v === fx.nodes[i]);
    const sameEdges =
      g.edges.length === fx.edges.length &&
      g.edges.every(([a, b], i) => a === fx.edges[i][0] && b === fx.edges[i][1]);

    let worst = 0;
    let missing = 0;
    for (const [v, [x, y]] of pegasusLayout(g)) {
      const ref = fx.pos[String(v)];
      if (!ref) {
        missing++;
        continue;
      }
      worst = Math.max(worst, Math.abs(x - ref[0]), Math.abs(y - ref[1]));
    }

    return [
      {
        name: `P(${fx.m}) qubits`,
        ok: sameNodes,
        detail: `ours ${g.nodes.length}, dwave_networkx ${fx.nodes.length}`,
      },
      {
        name: `P(${fx.m}) couplers`,
        ok: sameEdges,
        detail: `ours ${g.edges.length}, dwave_networkx ${fx.edges.length}`,
      },
      {
        name: `P(${fx.m}) layout`,
        ok: missing === 0 && worst <= POS_TOLERANCE,
        detail: `max deviation ${worst.toExponential(1)}${missing ? `, ${missing} positions missing` : ''}`,
      },
    ];
  });
}

export type EmbeddingReport = {
  id: string;
  section: string;
  n: number;
  edges: number;
  density: number;
  m: number;
  qubits: number;
  maxChain: number;
  meanChain: number;
  /** Search effort, in the units of `EmbedOptions.budget`, summed over the sizes tried. */
  work: number;
  ms: number;
  check: CheckResult;
};

export function verifyEmbeddings(): EmbeddingReport[] {
  return CATALOG.map((qcase) => {
    const { model } = derive(qcase);
    const source = problemGraph(model.Q);
    const t0 = performance.now();
    const { m, target, result, work } = findPegasusEmbedding(source);
    const ms = performance.now() - t0;

    const verdict = result.ok
      ? checkEmbedding(source, target, result.chains)
      : { ok: false, problems: [`no embedding found up to P(${m})`] };
    const stats = result.ok ? embeddingStats(result.chains) : { qubits: 0, maxChain: 0, meanChain: 0 };

    return {
      id: qcase.id,
      section: qcase.section,
      n: source.n,
      edges: source.edges.length,
      density: density(source),
      m,
      ...stats,
      work,
      ms,
      check: {
        name: 'valid embedding',
        ok: verdict.ok,
        detail: verdict.problems.join('; '),
      },
    };
  });
}

/**
 * The checker must reject broken embeddings, one per condition it enforces.
 * Without this, a checker that always said "valid" would pass every case above.
 */
export function verifyChecker(): CheckResult[] {
  const target = pegasusGraph(2);
  const coupled = (a: number, b: number) =>
    target.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const [a] = target.nodes;
  const far = target.nodes.find((q) => q !== a && !coupled(a, q))!;
  const near = target.nodes.find((q) => coupled(a, q))!;
  const third = target.nodes.find((q) => q !== a && q !== near && coupled(near, q))!;

  const edge = { n: 2, edges: [[0, 1]] as [number, number][] };
  const cases: { name: string; source: typeof edge; chains: number[][]; expectOk: boolean }[] = [
    { name: 'accepts a valid pair', source: edge, chains: [[a], [near]], expectOk: true },
    { name: 'rejects an empty chain', source: edge, chains: [[a], []], expectOk: false },
    { name: 'rejects a shared qubit', source: edge, chains: [[a, near], [near]], expectOk: false },
    { name: 'rejects a qubit not on the chip', source: edge, chains: [[a], [near, 99999]], expectOk: false },
    { name: 'rejects a disconnected chain', source: edge, chains: [[a, far], [near]], expectOk: false },
    { name: 'rejects a missing coupler', source: edge, chains: [[a], [far]], expectOk: false },
    { name: 'rejects a wrong chain count', source: edge, chains: [[a]], expectOk: false },
    { name: 'accepts a two-qubit chain', source: edge, chains: [[a, near], [third]], expectOk: true },
  ];
  return cases.map(({ name, source, chains, expectOk }) => {
    const { ok, problems } = checkEmbedding(source, target, chains);
    return { name, ok: ok === expectOk, detail: ok ? 'valid' : problems.join('; ') };
  });
}
