/**
 * Minor embedding: give each QUBO variable a CHAIN of physical qubits so that
 * every coupling the QUBO needs lands on a real coupler.
 *
 * A simplified version of the heuristic behind Ocean's `minorminer` (Cai,
 * Macready & Roy 2014, "A practical heuristic for finding graph minors",
 * arXiv:1406.2741). One variable at a time:
 *
 *   1. From each already-placed neighbour's chain, run a shortest-path search
 *      over the hardware where entering a qubit costs `1` if it is free and
 *      `α^k` if `k` chains already use it.
 *   2. Root the new chain at the qubit whose summed distance is smallest. The
 *      root's weight is paid once per neighbour, so a shared root is expensive.
 *   3. Grow the chain from the root towards each neighbour, farthest first;
 *      later paths treat the chain's own qubits as free, so they branch off it.
 *   4. Trim leaf qubits that touch no neighbour the rest of the chain misses.
 *
 * Driving that: chains may overlap while the search runs. Passes re-place every
 * variable with `α` growing until no qubit is shared; when progress stalls, a
 * kick tears out the chains on shared qubits plus a random half of the rest
 * and lets them re-settle. Once valid, shortening rounds tear out the longest
 * chains (again with a random half of the others), separate again, and keep
 * whichever valid layout has the shortest longest chain.
 *
 * Every kick tears its victims out TOGETHER before re-placing any of them.
 * Re-placing one at a time puts each victim back among the others still
 * standing, where its best spot is the one it just left, and nothing moves.
 *
 * How good it is, measured (`npm run compare:minorminer`): on the catalogue,
 * the same longest chain as minorminer in 29 of 31 cases and at most five more
 * qubits in total. On dense graphs it runs out sooner: about K₁₀ on P(2) (same
 * as minorminer), K₁₄ on P(3) and K₁₆ on P(4), where minorminer reaches K₂₄
 * and at least K₃₆. See docs/EMBEDDING.md.
 *
 * What this is NOT: it is not optimal, it is not what `EmbeddingComposite`
 * would return (that runs the full `minorminer` against a real QPU's working
 * graph), and failure does not prove that no embedding exists. Every success is
 * checked by `checkEmbedding`, which shares no code with this file.
 */

import { rng } from '../random';
import { adjacency, pegasusGraph, type HardwareGraph } from './pegasus';
import type { ProblemGraph } from './problemGraph';

export type EmbedOptions = {
  /** Deterministic seed, so the same QUBO always draws the same picture. */
  seed?: number;
  /** Independent restarts before giving up. */
  tries?: number;
  /** Re-placement passes allowed for each separation of overlapping chains. */
  maxPasses?: number;
  /** Shortening rounds once a valid embedding exists. */
  rounds?: number;
  /** Stop shortening after this many rounds without improvement. */
  patience?: number;
  /**
   * Work limit, in qubits scanned by shortest-path searches. It bounds how
   * long a hopeless search runs before giving up, and unlike a time limit it
   * gives the same answer on a fast machine and a slow one.
   */
  budget?: number;
};

export type EmbedResult =
  | {
      ok: true;
      /** `chains[i]` are the qubit labels of variable `i`, ascending. */
      chains: number[][];
      /** Which restart succeeded (0-based). */
      attempt: number;
      /** Work spent, in the units of `budget`. */
      work: number;
    }
  | { ok: false; attempts: number; work: number };

export const DEFAULT_EMBED_SEED = 0x5eed;

/** Above this the weights saturate; anything at the cap is effectively forbidden. */
const WEIGHT_CAP = 1e12;

/** Separation passes without progress before kicking chains loose. */
const STALL = 6;

/** Share of the uninvolved chains torn out as well when kicking. */
const KICK = 0.5;

/**
 * Per call. Every catalogue case needs well under this (the heaviest, about
 * 3M, is in docs/EMBEDDING.md); a search that has not succeeded by then
 * almost never does.
 */
export const DEFAULT_EMBED_BUDGET = 4e6;

/** Across all sizes `findPegasusEmbedding` tries, so a hopeless QUBO fails in seconds. */
export const DEFAULT_PEGASUS_BUDGET = 1e7;

export function findEmbedding(
  source: ProblemGraph,
  target: HardwareGraph,
  {
    seed = DEFAULT_EMBED_SEED,
    tries = 8,
    maxPasses = 64,
    rounds = 40,
    patience = 8,
    budget = DEFAULT_EMBED_BUDGET,
  }: EmbedOptions = {},
): EmbedResult {
  const n = source.n;
  const labels = target.nodes;
  const N = labels.length;
  if (n === 0) return { ok: true, chains: [], attempt: 0, work: 0 };
  if (n > N) return { ok: false, attempts: 0, work: 0 };

  let work = 0;
  const spent = () => work > budget;

  // Dense indices 0..N−1 for the hardware.
  const index = new Map(labels.map((v, i) => [v, i]));
  const adjByLabel = adjacency(target);
  const hw: number[][] = labels.map((v) => adjByLabel.get(v)!.map((w) => index.get(w)!));

  const nbrs: number[][] = Array.from({ length: n }, () => []);
  for (const [i, j] of source.edges) {
    nbrs[i].push(j);
    nbrs[j].push(i);
  }

  let rand = rng(seed);
  let chains: Set<number>[] = [];
  const usage = new Int32Array(N);

  const shuffled = (xs: number[]) => {
    const a = xs.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const remove = (v: number) => {
    for (const q of chains[v]) usage[q]--;
    chains[v] = new Set();
  };
  const assign = (v: number, chain: Set<number>) => {
    chains[v] = chain;
    for (const q of chain) usage[q]++;
  };

  // ── shortest paths with node weights ──
  const dist = new Float64Array(N);
  const parent = new Int32Array(N);
  const heapNode: number[] = [];
  const heapKey: number[] = [];

  const push = (node: number, key: number) => {
    let i = heapNode.length;
    heapNode.push(node);
    heapKey.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapKey[p] <= key) break;
      heapNode[i] = heapNode[p];
      heapKey[i] = heapKey[p];
      i = p;
    }
    heapNode[i] = node;
    heapKey[i] = key;
  };
  const pop = (): number => {
    const top = heapNode[0];
    const lastNode = heapNode.pop()!;
    const lastKey = heapKey.pop()!;
    const size = heapNode.length;
    if (size) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= size) break;
        if (c + 1 < size && heapKey[c + 1] < heapKey[c]) c++;
        if (heapKey[c] >= lastKey) break;
        heapNode[i] = heapNode[c];
        heapKey[i] = heapKey[c];
        i = c;
      }
      heapNode[i] = lastNode;
      heapKey[i] = lastKey;
    }
    return top;
  };

  /** Distances from chain `u` into every qubit; the result arrays are copies. */
  const searchFrom = (u: number, weight: (q: number) => number) => {
    work += N;
    dist.fill(Infinity);
    parent.fill(-1);
    heapNode.length = 0;
    heapKey.length = 0;
    for (const q of chains[u]) {
      dist[q] = 0;
      push(q, 0);
    }
    while (heapNode.length) {
      const d = heapKey[0];
      const q = pop();
      if (d > dist[q]) continue;
      for (const r of hw[q]) {
        const w = weight(r);
        if (w >= WEIGHT_CAP) continue;
        const nd = d + w;
        if (nd < dist[r]) {
          dist[r] = nd;
          parent[r] = q;
          push(r, nd);
        }
      }
    }
    return { dist: Float64Array.from(dist), parent: Int32Array.from(parent) };
  };

  /** Does `chain` (minus `skip`) touch chain `u`, by sharing a qubit or a coupler? */
  const touches = (chain: Set<number>, u: number, skip: number) => {
    const other = chains[u];
    for (const q of chain) {
      if (q === skip) continue;
      if (other.has(q)) return true;
      for (const r of hw[q]) if (other.has(r)) return true;
    }
    return false;
  };

  /** Drop leaf qubits whose every neighbour-contact is also made elsewhere in the chain. */
  const prune = (chain: Set<number>, placed: number[]) => {
    let changed = true;
    while (changed && chain.size > 1) {
      changed = false;
      for (const q of [...chain]) {
        if (chain.size === 1) break;
        let degree = 0;
        for (const r of hw[q]) if (chain.has(r)) degree++;
        if (degree > 1) continue;
        if (placed.every((u) => touches(chain, u, q))) {
          chain.delete(q);
          changed = true;
        }
      }
    }
  };

  /**
   * Builds a chain for `v` against the current chains (which must not include
   * `v`'s own). `alpha = Infinity` forbids shared qubits outright. Returns null
   * when no qubit can reach every placed neighbour.
   */
  const build = (v: number, alpha: number): Set<number> | null => {
    const weight = (q: number) =>
      usage[q] === 0 ? 1 : alpha === Infinity ? WEIGHT_CAP : Math.min(alpha ** usage[q], WEIGHT_CAP);
    const placed = nbrs[v].filter((u) => chains[u].size > 0);
    const searches = placed.map((u) => searchFrom(u, weight));

    let best = Infinity;
    let root = -1;
    let ties = 0;
    for (let q = 0; q < N; q++) {
      const wq = weight(q);
      if (wq >= WEIGHT_CAP) continue;
      // The root's own weight is paid once per neighbour (it is the endpoint of
      // every path), so a root on a shared qubit costs in proportion to how
      // many neighbours it serves. Charging it once instead lets chains pile
      // onto a few shared qubits and never separate.
      let cost = placed.length ? 0 : wq;
      for (let s = 0; s < placed.length; s++) {
        cost += chains[placed[s]].has(q) ? wq : searches[s].dist[q];
      }
      if (cost < best) {
        best = cost;
        root = q;
        ties = 1;
      } else if (cost === best && Number.isFinite(cost)) {
        ties++;
        if (rand() * ties < 1) root = q;
      }
    }
    if (root < 0 || !Number.isFinite(best)) return null;

    // Grow from the root, farthest neighbour first so its path becomes the
    // trunk. Each later path is searched again with the chain's own qubits
    // free, so it branches off the trunk instead of running beside it.
    const chain = new Set([root]);
    const order = placed
      .map((u, s) => ({ u, d: chains[u].has(root) ? 0 : searches[s].dist[root] }))
      .sort((a, b) => b.d - a.d);
    order.forEach(({ u }, i) => {
      const home = chains[u];
      if (touches(chain, u, -1)) return;
      const { dist: d, parent: par } =
        i === 0 ? searches[placed.indexOf(u)] : searchFrom(u, (q) => (chain.has(q) ? 0 : weight(q)));
      let start = -1;
      for (const q of chain) if (start < 0 || d[q] < d[start]) start = q;
      let q = start;
      while (!home.has(q)) {
        const p = par[q];
        if (p < 0 || home.has(p)) break;
        chain.add(p);
        q = p;
      }
    });
    prune(chain, placed);
    return chain;
  };

  const overfill = () => {
    let s = 0;
    for (let q = 0; q < N; q++) if (usage[q] > 1) s += usage[q] - 1;
    return s;
  };
  const all = Array.from({ length: n }, (_, i) => i);

  /** Re-place each of `vs` in turn, the others staying where they are. */
  const replace = (vs: number[], alpha: number) => {
    for (const v of vs) {
      const old = chains[v];
      remove(v);
      assign(v, build(v, alpha) ?? old);
    }
  };

  /**
   * Tear ALL of `vs` out first, then re-place them. Re-placing them one at a
   * time would rebuild each victim among the others still standing, and its
   * best spot is the one it just left — the kick would change nothing.
   */
  const kick = (vs: number[], alpha: number) => {
    const old = vs.map((v) => chains[v]);
    for (const v of vs) remove(v);
    vs.forEach((v, i) => assign(v, build(v, alpha) ?? old[i]));
  };

  /**
   * Re-place everything with sharing ever more expensive until no qubit is
   * shared. When the overlap stops shrinking, kick: tear out the chains on
   * shared qubits AND a random half of the rest, re-place them cheaply, and
   * restart the schedule. Kicking only the chains on shared qubits does not
   * work: with everything else fixed they slot straight back where they were.
   */
  const separate = (passes: number): boolean => {
    let best = overfill();
    let stall = 0;
    let step = 0;
    for (let pass = 0; pass < passes && best > 0 && !spent(); pass++) {
      replace(shuffled(all), Math.min(2 ** (step + 2), 4 * N));
      step++;
      const now = overfill();
      if (now < best) {
        best = now;
        stall = 0;
      } else if (++stall >= STALL) {
        const shared = new Set<number>();
        for (let q = 0; q < N; q++) if (usage[q] > 1) shared.add(q);
        kick(shuffled(all.filter((v) => rand() < KICK || [...chains[v]].some((q) => shared.has(q)))), 2);
        best = overfill();
        stall = 0;
        step = 0;
      }
    }
    return overfill() === 0;
  };

  /** Strict passes: re-place with shared qubits forbidden, keep only if not longer. */
  const tighten = (passes: number) => {
    for (let pass = 0; pass < passes; pass++) {
      for (const v of shuffled(all)) {
        const old = chains[v];
        remove(v);
        const next = build(v, Infinity);
        assign(v, next && next.size <= old.size ? next : old);
      }
    }
  };

  /** Lexicographic: longest chain first, then total qubits. Lower is better. */
  const score = () => {
    let max = 0;
    let total = 0;
    for (const c of chains) {
      max = Math.max(max, c.size);
      total += c.size;
    }
    return max * (N + 1) * n + total;
  };
  const snapshot = () => chains.map((c) => new Set(c));
  const restore = (s: Set<number>[]) => {
    usage.fill(0);
    chains = s.map((c) => new Set(c));
    for (const c of chains) for (const q of c) usage[q]++;
  };

  for (let attempt = 0; attempt < tries && !spent(); attempt++) {
    rand = rng((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
    chains = Array.from({ length: n }, () => new Set<number>());
    usage.fill(0);

    for (const v of shuffled(all)) assign(v, build(v, 2) ?? new Set());
    if (chains.some((c) => c.size === 0) || !separate(maxPasses)) continue;
    tighten(2);

    // Shorten: tear out the longest chains, let them cut across others, then
    // separate again. Keep the best valid layout; stop after `patience` rounds
    // without improvement.
    let best = snapshot();
    let bestScore = score();
    for (let round = 0, stall = 0; round < rounds && stall < patience && !spent(); round++) {
      const longest = Math.max(...chains.map((c) => c.size));
      if (longest <= 1) break;
      const victims = all.filter((v) => chains[v].size >= longest || rand() < KICK);
      kick(shuffled(victims), 2);
      if (separate(maxPasses)) {
        tighten(1);
        const s = score();
        if (s < bestScore) {
          best = snapshot();
          bestScore = s;
          stall = 0;
          continue;
        }
      }
      stall++;
      restore(best);
    }
    restore(best);

    return {
      ok: true,
      chains: chains.map((c) => [...c].map((q) => labels[q]).sort((a, b) => a - b)),
      attempt,
      work,
    };
  }
  return { ok: false, attempts: tries, work };
}

/** The Pegasus sizes tried, smallest first: 40, 128, 264 and 680 qubits. */
export const PEGASUS_SIZES = [2, 3, 4, 6] as const;

export type PegasusEmbedding = {
  /** The size that worked, or the largest tried on failure. */
  m: number;
  target: HardwareGraph;
  result: EmbedResult;
  /** Work across every size tried, failures included. */
  work: number;
};

/**
 * Tries Pegasus fragments from smallest to largest and keeps the first that
 * works. "The smallest that worked" is a statement about this heuristic, not a
 * lower bound on the hardware a QUBO needs.
 */
export function findPegasusEmbedding(
  source: ProblemGraph,
  options: EmbedOptions & { sizes?: readonly number[]; totalBudget?: number } = {},
): PegasusEmbedding {
  const {
    sizes = PEGASUS_SIZES,
    totalBudget = DEFAULT_PEGASUS_BUDGET,
    budget = DEFAULT_EMBED_BUDGET,
    ...rest
  } = options;
  let work = 0;
  let last: Omit<PegasusEmbedding, 'work'> | null = null;
  for (const m of sizes) {
    if (work >= totalBudget) break;
    const target = pegasusGraph(m);
    if (source.n > target.nodes.length) continue;
    const result = findEmbedding(source, target, {
      ...rest,
      budget: Math.min(budget, totalBudget - work),
    });
    work += result.work;
    last = { m, target, result };
    if (result.ok) return { ...last, work };
  }
  if (last) return { ...last, work };
  const m = sizes[sizes.length - 1];
  return { m, target: pegasusGraph(m), result: { ok: false, attempts: 0, work: 0 }, work };
}

export type EmbeddingStats = {
  /** Physical qubits used across all chains. */
  qubits: number;
  maxChain: number;
  meanChain: number;
};

export function embeddingStats(chains: number[][]): EmbeddingStats {
  const sizes = chains.map((c) => c.length);
  const qubits = sizes.reduce((s, x) => s + x, 0);
  return {
    qubits,
    maxChain: sizes.length ? Math.max(...sizes) : 0,
    meanChain: sizes.length ? qubits / sizes.length : 0,
  };
}

/**
 * For each problem edge, the couplers between the two chains — where `Q_ij`
 * physically lives. On hardware the coupling is split across them; any one
 * suffices for the embedding to be valid.
 */
export function chainCouplers(
  source: ProblemGraph,
  target: HardwareGraph,
  chains: number[][],
): Map<string, [number, number][]> {
  const adj = adjacency(target);
  const out = new Map<string, [number, number][]>();
  for (const [i, j] of source.edges) {
    const inJ = new Set(chains[j]);
    const found: [number, number][] = [];
    for (const a of chains[i]) for (const b of adj.get(a) ?? []) if (inJ.has(b)) found.push([a, b]);
    out.set(`${i},${j}`, found);
  }
  return out;
}

/** Couplers joining qubits of the same chain — what holds the chain together. */
export function intraChainCouplers(target: HardwareGraph, chains: number[][]): [number, number][][] {
  const owner = new Map<number, number>();
  chains.forEach((c, i) => c.forEach((q) => owner.set(q, i)));
  const out: [number, number][][] = chains.map(() => []);
  for (const [a, b] of target.edges) {
    const i = owner.get(a);
    if (i !== undefined && i === owner.get(b)) out[i].push([a, b]);
  }
  return out;
}
