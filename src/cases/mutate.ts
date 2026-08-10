/**
 * Rebuilds a case from reader-supplied data.
 *
 * The rule this file exists to enforce: the moment any input changes, the case
 * is marked `custom` and the paper comparison must stop being claimed. The
 * derivation and the exhaustive solve stay exactly as rigorous — only the
 * published reference goes away.
 */

import type { Clause, Graph, QuboCase } from '../types';
import { decisionVars, gridVars, row, unitRow } from './helpers';

export type CaseEdit =
  | { kind: 'numbers'; numbers: number[] }
  | { kind: 'graph'; graph: Graph }
  | { kind: 'coloring'; graph: Graph; k: number }
  | { kind: 'sat'; numVars: number; clauses: Clause[] }
  | { kind: 'hello'; linear: number[]; quadratic: { i: number; j: number; coef: number }[] };

/** Node ids as printed are 1-based; positions in `graph.nodes` are the variable indices. */
function edgeIndices(graph: Graph): [number, number][] {
  const idx = new Map(graph.nodes.map((id, i) => [id, i]));
  return graph.edges
    .map(([a, b]) => [idx.get(a), idx.get(b)] as [number | undefined, number | undefined])
    .filter((p): p is [number, number] => p[0] !== undefined && p[1] !== undefined);
}

export function applyEdit(base: QuboCase, edit: CaseEdit): QuboCase {
  switch (edit.kind) {
    case 'numbers': {
      const s = edit.numbers;
      const total = s.reduce((a, b) => a + b, 0);
      return {
        ...base,
        custom: true,
        model: {
          ...base.model,
          numVars: s.length,
          varMeta: decisionVars(s.length),
          linear: new Array<number>(s.length).fill(0),
          quadratic: [],
          constraints: [row([...s], '=', total / 2, 'transform1', 'balance')],
        },
      };
    }

    case 'graph': {
      const n = edit.graph.nodes.length;
      const edges = edgeIndices(edit.graph);
      if (base.id === 'max-cut') {
        return {
          ...base,
          custom: true,
          graph: edit.graph,
          model: {
            ...base.model,
            numVars: n,
            varMeta: decisionVars(n),
            linear: new Array<number>(n).fill(0),
            quadratic: [],
            constraints: [],
            cutEdges: edges,
          },
        };
      }
      // Minimum Vertex Cover: one `xᵢ + xⱼ ≥ 1` per edge.
      return {
        ...base,
        custom: true,
        graph: edit.graph,
        model: {
          ...base.model,
          numVars: n,
          varMeta: decisionVars(n),
          linear: new Array<number>(n).fill(1),
          quadratic: [],
          constraints: edges.map(([a, b], k) =>
            unitRow(n, [a, b], '>=', 1, 'atLeastOne', `edge ${k + 1}`),
          ),
        },
      };
    }

    case 'coloring': {
      const nodes = edit.graph.nodes;
      const K = edit.k;
      const n = nodes.length * K;
      const at = (nodePos: number, color: number) => nodePos * K + color;
      const idx = new Map(nodes.map((id, i) => [id, i]));

      const constraints = [
        ...nodes.map((id, p) =>
          unitRow(
            n,
            Array.from({ length: K }, (_, c) => at(p, c)),
            '=',
            1,
            'transform1' as const,
            `node ${id}: exactly one colour`,
          ),
        ),
        ...edit.graph.edges.flatMap(([a, b]) => {
          const pa = idx.get(a);
          const pb = idx.get(b);
          if (pa === undefined || pb === undefined) return [];
          return Array.from({ length: K }, (_, c) =>
            unitRow(n, [at(pa, c), at(pb, c)], '<=', 1, 'transform2' as const, `edge (${a},${b}): colour ${c + 1}`),
          );
        }),
      ];

      return {
        ...base,
        custom: true,
        graph: edit.graph,
        model: {
          ...base.model,
          numVars: n,
          varMeta: gridVars(nodes.length, K, 'color'),
          linear: new Array<number>(n).fill(0),
          quadratic: [],
          constraints,
        },
      };
    }

    case 'sat':
      return {
        ...base,
        custom: true,
        model: {
          ...base.model,
          numVars: edit.numVars,
          varMeta: decisionVars(edit.numVars),
          linear: new Array<number>(edit.numVars).fill(0),
          quadratic: [],
          constraints: [],
          clauses: edit.clauses,
        },
      };

    case 'hello':
      return {
        ...base,
        custom: true,
        model: {
          ...base.model,
          linear: edit.linear,
          quadratic: edit.quadratic,
        },
      };
  }
}

/** Largest magnitude in Q, for the float-precision guard. */
export function maxMagnitude(Q: number[][]): number {
  let m = 0;
  for (const r of Q) for (const v of r) m = Math.max(m, Math.abs(v));
  return m;
}

/** Beyond 2^53 a double can no longer represent consecutive integers exactly. */
export const SAFE_MAGNITUDE = Number.MAX_SAFE_INTEGER;
