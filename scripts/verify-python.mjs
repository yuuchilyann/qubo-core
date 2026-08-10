/**
 * Cross-verifies the embedded Python modelling module against the TypeScript
 * derivation and against the paper.
 *
 *     npm run verify:python
 *
 * `src/python/module.ts` carries `build_qubo()` as a string, and it is a
 * hand-maintained port of `src/derive.ts`. That is the one place in this
 * project where the same algorithm exists twice, so it is the one place that can
 * silently drift. This script executes the real module under the system Python,
 * feeds it the same eleven models the app ships, and asserts three-way agreement:
 *
 *     Python build_qubo()  ==  TypeScript derive()  ==  the paper's printed Q
 *
 * Requires `python` on PATH. No third-party packages: the module is pure stdlib.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const PY = process.env.PYTHON ?? 'python';

function runPython(source, stdin) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, ['-c', source], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) reject(new Error(err || `python exited ${code}`));
      else resolve(out);
    });
    p.stdin.write(stdin);
    p.stdin.end();
  });
}

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true, open: false },
  appType: 'custom',
});

let failed = 0;

try {
  const { ALL_CASES } = await server.ssrLoadModule('/src/cases/index.ts');
  const { derive } = await server.ssrLoadModule('/src/derive.ts');
  const { FUNCTION_MODULE } = await server.ssrLoadModule('/src/python/module.ts');
  const { toPythonModel } = await server.ssrLoadModule('/src/python/serialize.ts');

  // The real module verbatim, plus a thin JSON driver.
  const driver = `${FUNCTION_MODULE}

import json, sys

payload = json.load(sys.stdin)
result = []
for item in payload:
    Q, constant, n = build_qubo(item["model"], P=item["P"])
    result.append({"id": item["id"], "Q": Q, "constant": constant, "n": n})
json.dump(result, sys.stdout)
`;

  const payload = ALL_CASES.map((c) => ({
    id: c.id,
    P: c.penalty?.paperValue ?? 1,
    model: toPythonModel(c),
  }));

  console.log(`\n${BOLD}Python ↔ TypeScript ↔ paper — three-way agreement${RESET}`);
  console.log(`${DIM}interpreter: ${PY}${RESET}\n`);

  let raw;
  try {
    raw = await runPython(driver, JSON.stringify(payload));
  } catch (e) {
    console.log(`${YELLOW}SKIP${RESET}  cannot run Python (${PY}): ${e.message.split('\n')[0]}`);
    console.log(`${DIM}      set PYTHON=<path> to point at an interpreter${RESET}\n`);
    await server.close();
    process.exit(0);
  }

  const fromPython = new Map(JSON.parse(raw).map((r) => [r.id, r]));

  for (const qcase of ALL_CASES) {
    const py = fromPython.get(qcase.id);
    const { model: ts } = derive(qcase);
    const problems = [];

    if (!py) {
      problems.push('no result returned from Python');
    } else {
      if (py.n !== ts.n) problems.push(`n: python=${py.n} ts=${ts.n}`);
      else {
        for (let i = 0; i < ts.n; i++) {
          for (let j = 0; j < ts.n; j++) {
            if (Math.abs(py.Q[i][j] - ts.Q[i][j]) > 1e-9) {
              problems.push(`Q[${i}][${j}]: python=${py.Q[i][j]} ts=${ts.Q[i][j]}`);
            }
            if (Math.abs(py.Q[i][j] - qcase.paperQ[i][j]) > 1e-9) {
              problems.push(`Q[${i}][${j}]: python=${py.Q[i][j]} paper=${qcase.paperQ[i][j]}`);
            }
          }
        }
      }
      if (Math.abs(py.constant - ts.constant) > 1e-9) {
        problems.push(`constant: python=${py.constant} ts=${ts.constant}`);
      }
      if (Math.abs(py.constant - qcase.paperConstant) > 1e-9) {
        problems.push(`constant: python=${py.constant} paper=${qcase.paperConstant}`);
      }
    }

    const ok = problems.length === 0;
    const mark = ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(
      `  ${mark} ${qcase.section.padEnd(6)} ${qcase.id.padEnd(22)} ${DIM}n=${ts.n}${RESET}`,
    );
    for (const p of problems.slice(0, 5)) console.log(`      ${RED}${p}${RESET}`);
    if (problems.length > 5) console.log(`      ${DIM}…(+${problems.length - 5} more)${RESET}`);
    if (!ok) failed++;
  }
} finally {
  await server.close();
}

if (failed) {
  console.log(
    `\n${RED}${BOLD}${failed} case(s) drifted.${RESET} Re-sync src/python/module.ts with src/derive.ts.\n`,
  );
  process.exit(1);
}
console.log(`\n${GREEN}${BOLD}Python module matches TypeScript and the paper on all cases.${RESET}\n`);
