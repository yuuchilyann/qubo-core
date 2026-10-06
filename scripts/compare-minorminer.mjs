/**
 * Puts our embeddings next to Ocean's minorminer on the same Pegasus fragment.
 *
 *     pip install minorminer dwave-networkx
 *     npm run compare:minorminer
 *
 * Informational, not a pass/fail check, and deliberately not part of
 * `verify:all`: minorminer is randomised and better engineered, and the point
 * is to keep an honest record of how far the simplified heuristic is from the
 * real tool (docs/EMBEDDING.md quotes this table). Needs Ocean installed.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const PY = process.env.PYTHON ?? 'python';

const PYTHON = String.raw`
import json, sys, warnings
warnings.simplefilter('ignore', DeprecationWarning)
import dwave_networkx as dnx, minorminer
out = []
for job in json.load(sys.stdin):
    T = dnx.pegasus_graph(job['m'])
    best = None
    for seed in range(5):
        emb = minorminer.find_embedding(job['edges'], T.edges(), random_seed=seed)
        if job['edges'] and not emb:
            continue  # minorminer signals failure with an empty dict
        # minorminer only returns chains for variables that appear in an edge;
        # an isolated variable still needs a qubit of its own.
        sizes = [len(c) for c in emb.values()] + [1] * (job['n'] - len(emb))
        key = (max(sizes), sum(sizes))
        if best is None or key < best:
            best = key
    out.append(None if best is None else {'max': best[0], 'qubits': best[1]})
print(json.dumps(out))
`;

function runPython(input) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, ['-c', PYTHON], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err))));
    p.stdin.end(JSON.stringify(input));
  });
}

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true, open: false },
  appType: 'custom',
});

try {
  const { verifyEmbeddings } = await server.ssrLoadModule('/src/verify/hardware.ts');
  const { CATALOG } = await server.ssrLoadModule('/src/cases/index.ts');
  const { derive } = await server.ssrLoadModule('/src/derive.ts');
  const { problemGraph } = await server.ssrLoadModule('/src/hardware/problemGraph.ts');

  const ours = verifyEmbeddings();
  const jobs = CATALOG.map((qcase, i) => {
    const g = problemGraph(derive(qcase).model.Q);
    return { n: g.n, edges: g.edges, m: ours[i].m };
  });
  const theirs = await runPython(jobs);

  console.log(`\n${BOLD}Ours vs minorminer${RESET} ${DIM}(same Pegasus fragment; minorminer best of 5 seeds)${RESET}`);
  console.log(`${DIM}  case                      P(m)   qubits ours/mm   max chain ours/mm${RESET}`);
  ours.forEach((r, i) => {
    const mm = theirs[i];
    const q = mm ? `${r.qubits}/${mm.qubits}` : `${r.qubits}/—`;
    const c = mm ? `${r.maxChain}/${mm.max}` : `${r.maxChain}/—`;
    console.log(`  ${r.id.padEnd(24)} ${`P(${r.m})`.padStart(5)}  ${q.padStart(15)}  ${c.padStart(18)}`);
  });
  console.log();
} finally {
  await server.close();
}
