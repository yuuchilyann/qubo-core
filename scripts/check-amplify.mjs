/**
 * Runs every `amplify-da4` program against the REAL Fixstars Amplify.
 *
 *     pip install amplify
 *     npm run check:amplify            # PYTHON=<interpreter with amplify> if not on PATH
 *
 * `verify:emit` runs these programs against a stub, which can only encode our
 * reading of Amplify's API. This closes that gap without a Fujitsu token: the
 * real library builds the variables, polynomials, constraints, model and
 * `FujitsuDA4Client` (which rejects unknown attributes), and runs its own local
 * conversion `to_unconstrained_poly()`. Only `solve()` is replaced, by an
 * enumeration over the real model's variables using the real constraints'
 * `is_satisfied`. So it still says nothing about Fujitsu's service.
 *
 * Deliberately not part of `verify:all`: it needs Amplify installed.
 * docs/PYTHON_EXPORT.md records the version it last passed on.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const PY = process.env.PYTHON ?? 'python';
const dir = mkdtempSync(join(tmpdir(), 'qubo-core-amplify-'));

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true, open: false },
  appType: 'custom',
});

let code = 1;
try {
  const { CATALOG } = await server.ssrLoadModule('/src/cases/index.ts');
  const { derive } = await server.ssrLoadModule('/src/derive.ts');
  const { solveConstrained } = await server.ssrLoadModule('/src/constrained.ts');
  const { emitTier1, emitTier2 } = await server.ssrLoadModule('/src/python/emit.ts');

  const index = [];
  for (const qcase of CATALOG) {
    const { model } = derive(qcase);
    const expect =
      qcase.source === 'worked'
        ? qcase.paperSolution
        : (() => {
            const best = solveConstrained(qcase.model).best;
            return { yQubo: best - model.constant, yOriginal: best };
          })();
    for (const tier of [1, 2]) {
      const file = `${qcase.id}-t${tier}.py`;
      const body =
        tier === 1 ? emitTier1(qcase, model, 'amplify-da4') : emitTier2(qcase, model, 'amplify-da4');
      writeFileSync(join(dir, file), body);
      index.push({ file, id: qcase.id, tier, yQubo: expect.yQubo, yOriginal: expect.yOriginal });
    }
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index));

  code = await new Promise((resolve) => {
    const p = spawn(PY, ['scripts/check_amplify.py', dir], {
      stdio: 'inherit',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    p.on('error', (e) => {
      console.log(`cannot run Python (${PY}): ${e.message}`);
      resolve(1);
    });
    p.on('close', resolve);
  });
} finally {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
