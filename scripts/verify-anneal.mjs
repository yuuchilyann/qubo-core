/**
 * Runs the Digital Annealer reproduction on every catalogue case and checks its
 * properties.
 *
 *     npm run verify:anneal
 *
 * The table it prints (hit rates for parallel vs single trial, acceptance,
 * register widths) is where the numbers in docs/DIGITAL_ANNEALER.md come from.
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
const mark = (ok) => (ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`);

try {
  const { verifyAnnealCases, verifyAnnealProperties, verifySplit } = await server.ssrLoadModule(
    '/src/verify/annealer.ts',
  );

  console.log(`\n${BOLD}Digital Annealer reproduction on every case${RESET} ${DIM}(default schedule, 32 runs each)${RESET}`);
  console.log(
    `${DIM}       §      case                      n   parallel  single   acc(par) acc(single)  bits h/J${RESET}`,
  );
  let par = 0;
  let single = 0;
  let total = 0;
  for (const r of verifyAnnealCases()) {
    par += r.parallelHits;
    single += r.singleHits;
    total += r.runs;
    const row = [
      r.section.padEnd(6),
      r.id.padEnd(24),
      String(r.n).padStart(3),
      `${r.parallelHits}/${r.runs}`.padStart(9),
      `${r.singleHits}/${r.runs}`.padStart(7),
      `${(r.parallelAcceptance * 100).toFixed(0)}%`.padStart(9),
      `${(r.singleAcceptance * 100).toFixed(0)}%`.padStart(11),
      `${r.linearBits}/${r.quadraticBits}`.padStart(9),
    ].join(' ');
    console.log(`  ${mark(r.check.ok)}  ${row}`);
    if (!r.check.ok) {
      console.log(`        ${RED}${r.check.detail}${RESET}`);
      failed++;
    }
  }
  console.log(`  ${DIM}runs reaching the optimum: parallel ${par}/${total}, single ${single}/${total}${RESET}`);

  console.log(`\n${BOLD}Properties${RESET}`);
  for (const check of verifyAnnealProperties()) {
    console.log(`  ${mark(check.ok)} ${check.name.padEnd(44)} ${DIM}${check.detail}${RESET}`);
    if (!check.ok) failed++;
  }

  console.log(`
${BOLD}Submission structure for DA3 and later${RESET} ${DIM}(cost/penalty split; native one-hot and inequalities)${RESET}`);
  console.log(`${DIM}       §      case                      n      P   one-hot      ineq  eq   slack saved   vars  excluded${RESET}`);
  console.log(`  ${DIM}excluded = feasible decisions the QUBO cannot reach at zero penalty, because the slack bound is below the row's full range${RESET}`);
  for (const r of verifySplit()) {
    const c = r.native.constraints;
    const count = (k) => c.filter((x) => x.kind === k).length;
    const hot = count('oneHot') ? `${count('oneHot')} ${r.native.oneHot.kind}` : '—';
    const row = [
      r.section.padEnd(6),
      r.id.padEnd(24),
      String(r.n).padStart(3),
      String(r.P).padStart(6),
      hot.padStart(15),
      String(count('inequality')).padStart(5),
      String(count('equality')).padStart(3),
      String(r.native.slackSaved).padStart(13),
      `${r.native.paperVars}→${r.native.nativeVars}`.padStart(7),
      String(r.excluded || '').padStart(9),
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
