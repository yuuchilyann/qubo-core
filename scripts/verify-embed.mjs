/**
 * Checks the Pegasus generator against dwave_networkx, then embeds every
 * catalogue case and validates each embedding.
 *
 *     npm run verify:embed
 *
 * The table it prints (qubits used, chain lengths, fragment size) is where the
 * numbers in docs/EMBEDDING.md come from.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'vite';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const fixtures = readdirSync('fixtures')
  .filter((f) => /^pegasus-m\d+\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(`fixtures/${f}`, 'utf8')))
  .sort((a, b) => a.m - b.m);

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true, open: false },
  appType: 'custom',
});

let failed = 0;
const mark = (ok) => (ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`);

try {
  const { verifyPegasus, verifyChecker, verifyEmbeddings } = await server.ssrLoadModule(
    '/src/verify/hardware.ts',
  );

  console.log(`\n${BOLD}Pegasus topology vs dwave_networkx${RESET}`);
  if (!fixtures.length) {
    console.log(`  ${RED}✗ no fixtures in fixtures/ — run scripts/gen-pegasus-fixture.py${RESET}`);
    failed++;
  } else {
    console.log(`  ${DIM}${fixtures[0].generator.replace(/ pegasus_graph.*/, '')}${RESET}`);
  }
  for (const check of verifyPegasus(fixtures)) {
    console.log(`  ${mark(check.ok)} ${check.name.padEnd(18)} ${DIM}${check.detail}${RESET}`);
    if (!check.ok) failed++;
  }

  console.log(`\n${BOLD}Embedding checker${RESET} ${DIM}(must reject each kind of broken embedding)${RESET}`);
  for (const check of verifyChecker()) {
    console.log(`  ${mark(check.ok)} ${check.name.padEnd(34)} ${DIM}${check.detail}${RESET}`);
    if (!check.ok) failed++;
  }

  console.log(`\n${BOLD}Embedding every case${RESET} ${DIM}(default input and P; smallest fragment that worked)${RESET}`);
  console.log(
    `${DIM}       §      case                      n  edges  density  P(m)  qubits  max  mean   work     ms${RESET}`,
  );
  for (const r of verifyEmbeddings()) {
    const row = [
      r.section.padEnd(6),
      r.id.padEnd(24),
      String(r.n).padStart(3),
      String(r.edges).padStart(6),
      r.density.toFixed(2).padStart(8),
      `P(${r.m})`.padStart(5),
      String(r.qubits).padStart(7),
      String(r.maxChain).padStart(4),
      r.meanChain.toFixed(2).padStart(5),
      `${(r.work / 1e6).toFixed(1)}M`.padStart(6),
      r.ms.toFixed(0).padStart(6),
    ].join(' ');
    console.log(`  ${mark(r.check.ok)}  ${row}`);
    if (!r.check.ok) {
      console.log(`        ${RED}${r.check.detail}${RESET}`);
      failed++;
    }
  }
} finally {
  await server.close();
}

if (failed) {
  console.log(`\n${RED}${BOLD}${failed} check(s) failed.${RESET}\n`);
  process.exit(1);
}
console.log(`\n${GREEN}${BOLD}All checks passed.${RESET}\n`);
