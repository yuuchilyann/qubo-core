/**
 * Runs the reconciliation harness against all eleven paper cases.
 *
 *     npm run verify
 *
 * Uses Vite's SSR module loader so the TypeScript sources are consumed directly,
 * with the project's own resolution rules. That matters: a hand-written JS mirror
 * of the derivation would be able to drift from the app, which is exactly the
 * failure mode this harness exists to prevent.
 */

import { createServer } from 'vite';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true, open: false },
  appType: 'custom',
});

let failed = 0;

try {
  const { verifyAll, verifyTabuAgreement } = await server.ssrLoadModule(
    '/src/verify/harness.ts',
  );

  console.log(`\n${BOLD}QUBO Model Explorer — case reconciliation${RESET}`);
  console.log(
    `${DIM}Glover, Kochenberger & Du, "A Tutorial on Formulating and Using QUBO Models"${RESET}\n`,
  );

  for (const report of verifyAll()) {
    const head = report.ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`${head}  ${report.section.padEnd(6)} ${report.id}  ${DIM}n=${report.n}${RESET}`);
    for (const check of report.checks) {
      const mark = check.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      console.log(`        ${mark} ${check.name}`);
      if (!check.ok || process.env.VERBOSE) {
        console.log(`          ${DIM}${check.detail ?? ''}${RESET}`);
      }
      if (!check.ok) failed++;
    }
  }

  console.log(`\n${BOLD}Tabu search agreement${RESET} ${DIM}(regression guard, not a correctness requirement)${RESET}`);
  for (const check of verifyTabuAgreement()) {
    const mark = check.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${mark} ${check.name}  ${DIM}${check.detail}${RESET}`);
    if (!check.ok) failed++;
  }
} finally {
  await server.close();
}

if (failed) {
  console.log(`\n${RED}${BOLD}${failed} check(s) failed.${RESET}\n`);
  process.exit(1);
}
console.log(`\n${GREEN}${BOLD}All checks passed.${RESET}\n`);
