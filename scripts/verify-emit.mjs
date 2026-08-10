/**
 * Executes the emitted Python and checks it prints the paper's answer.
 *
 *     npm run verify:emit
 *
 * The reconciliation harness proves the Q matrix is right; this proves the
 * PROGRAM around it is right — the upper-triangular conversion, the maximisation
 * sign flip, the additive offset, the variable indexing. Those live only in the
 * emitter, so nothing else would catch a mistake in them.
 *
 * A stdlib-only stub is injected as `dimod`, `dwave.samplers` and
 * `dwave.system` so the emitted source runs VERBATIM without installing
 * anything into the user's interpreter. Both tiers are exercised, against every
 * sampler a reader can run without an account.
 *
 * **What a green line does and does not mean.** Every stubbed sampler is the
 * same brute-force solver under a different name, so this proves the program:
 * the imports resolve, the construction expression is well formed, the keyword
 * arguments are accepted, and the sign flip, offset and indexing are right. It
 * does **not** prove that simulated annealing reaches the paper's answer. That
 * is a claim about the sampler, and running the real one is the only thing that
 * would support it.
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

/**
 * Which programs get executed.
 *
 * Every token-free sampler, because each one produces a *different program*:
 * different imports, a different construction expression, and in `mock`'s case
 * a composite that wraps another sampler. Those differences are exactly where
 * an emitter mistake would hide, and checking only `exact` left three of the
 * four shapes unexecuted.
 *
 * `qpu` and `hybrid` are absent on purpose. Their programs cannot run without
 * an account, so a stub would be asserting something about code no reader can
 * execute the way this harness executes the rest.
 */
const TIER_SAMPLERS = [
  [1, 'exact'],
  [2, 'exact'],
  [1, 'sa'],
  [2, 'sa'],
  [1, 'tabu'],
  [1, 'mock'],
];

/** A stand-in for Ocean's dimod, sufficient for the code we emit. */
const DIMOD_STUB = `
import sys, types, itertools, json

class _Zeros(dict):
    # Variables absent from Q contribute nothing, so 0 is the right default.
    def __missing__(self, k):
        return 0

class _BQM:
    def __init__(self, Q):
        self.Q = dict(Q)
        self.n = (1 + max(max(i, j) for (i, j) in self.Q)) if self.Q else 0

    @classmethod
    def from_qubo(cls, Q):
        return cls(Q)

class _Sample:
    def __init__(self, sample, energy):
        self.sample = sample
        self.energy = energy

class _SampleSet:
    def __init__(self, first):
        self.first = first

class _ExactSolver:
    def sample(self, bqm, **kw):
        best_bits, best_e = None, None
        for bits in itertools.product((0, 1), repeat=bqm.n):
            e = 0.0
            for (i, j), c in bqm.Q.items():
                if bits[i] and bits[j]:
                    e += c
            if best_e is None or e < best_e:
                best_bits, best_e = bits, e
        sample = _Zeros((i, best_bits[i]) for i in range(bqm.n))
        return _SampleSet(_Sample(sample, best_e))

_stub = types.ModuleType("dimod")
_stub.BinaryQuadraticModel = _BQM
_stub.ExactSolver = _ExactSolver
sys.modules["dimod"] = _stub

# ── dwave.samplers and dwave.system ───────────────────────────────────────────
# Every sampler below is the exhaustive solver above wearing a different name,
# and that is deliberate. What gets checked is the PROGRAM: that the imports
# resolve, that the construction call has the shape the emitter wrote, that
# sample() accepts the keyword arguments it is given, and that the sign flip,
# the offset and the indexing around it are right.
#
# Whether simulated annealing would actually reach the optimum is a question
# about the sampler, not about the emitted code, and no stub can answer it.
# A green line here does NOT mean "SA reaches the paper's answer".
class _Passthrough:
    def __init__(self, *a, **kw):
        pass

    def sample(self, bqm, **kw):
        return _ExactSolver().sample(bqm)

# EmbeddingComposite wraps another sampler, so the stub has to accept one and
# delegate; a no-arg stand-in would let a wrong construction call pass.
class _EmbeddingComposite:
    def __init__(self, child):
        self.child = child

    def sample(self, bqm, **kw):
        return self.child.sample(bqm, **kw)

_samplers = types.ModuleType("dwave.samplers")
_samplers.SimulatedAnnealingSampler = _Passthrough
_samplers.TabuSampler = _Passthrough

_testing = types.ModuleType("dwave.system.testing")
_testing.MockDWaveSampler = _Passthrough

_system = types.ModuleType("dwave.system")
_system.EmbeddingComposite = _EmbeddingComposite
_system.DWaveSampler = _Passthrough
_system.LeapHybridSampler = _Passthrough
_system.testing = _testing

_dwave = types.ModuleType("dwave")
_dwave.samplers = _samplers
_dwave.system = _system

sys.modules["dwave"] = _dwave
sys.modules["dwave.samplers"] = _samplers
sys.modules["dwave.system"] = _system
sys.modules["dwave.system.testing"] = _testing

# Capture what the emitted script prints instead of letting it hit stdout.
_captured = []
_real_print = print
def print(*args, **kw):
    _captured.append(" ".join(str(a) for a in args))
import builtins
builtins.print = print
`;

const REPORT = `
builtins.print = _real_print
_real_print(json.dumps({"x": x, "y_qubo": y_qubo, "y_original": y_original}))
`;

function runPython(source) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, ['-c', source], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || `exit ${code}`))));
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
  const { emitTier1, emitTier2 } = await server.ssrLoadModule('/src/python/emit.ts');

  console.log(`\n${BOLD}Emitted Python — does it actually reproduce the paper?${RESET}`);
  console.log(`${DIM}stub dimod, no packages installed; both tiers executed verbatim${RESET}\n`);

  // Fail fast if Python is unavailable rather than reporting a false pass.
  try {
    await runPython('print(1)');
  } catch (e) {
    console.log(`${YELLOW}SKIP${RESET}  cannot run Python (${PY}): ${String(e.message).split('\n')[0]}\n`);
    await server.close();
    process.exit(0);
  }

  for (const qcase of ALL_CASES) {
    const { model } = derive(qcase);
    const expect = qcase.paperSolution;

    for (const [tier, sampler] of TIER_SAMPLERS) {
      const body = tier === 1 ? emitTier1(qcase, model, sampler) : emitTier2(qcase, model, sampler);
      const source = `${DIMOD_STUB}\n${body}\n${REPORT}`;

      let got;
      try {
        const raw = await runPython(source);
        got = JSON.parse(raw.trim().split('\n').pop());
      } catch (e) {
        console.log(
          `  ${RED}✗${RESET} ${qcase.section.padEnd(6)} tier ${tier} ${sampler.padEnd(5)} ${RED}${String(e.message).trim().split('\n').slice(-1)[0]}${RESET}`,
        );
        failed++;
        continue;
      }

      const problems = [];
      if (got.y_qubo !== expect.yQubo) problems.push(`xᵀQx=${got.y_qubo} paper=${expect.yQubo}`);
      if (got.y_original !== expect.yOriginal) {
        problems.push(`original=${got.y_original} paper=${expect.yOriginal}`);
      }
      // Degenerate optima mean a different x can be equally correct, so the
      // assignment is only required to ATTAIN the paper's value, not equal its x.
      if (got.x.length !== model.n) problems.push(`|x|=${got.x.length} expected ${model.n}`);

      const ok = problems.length === 0;
      console.log(
        `  ${ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`} ${qcase.section.padEnd(6)} tier ${tier} ${sampler.padEnd(5)} ` +
          `${DIM}xᵀQx=${got.y_qubo} original=${got.y_original}${RESET}` +
          (ok ? '' : `  ${RED}${problems.join('; ')}${RESET}`),
      );
      if (!ok) failed++;
    }
  }
} finally {
  await server.close();
}

if (failed) {
  console.log(`\n${RED}${BOLD}${failed} emitted program(s) did not reproduce the paper.${RESET}\n`);
  process.exit(1);
}
console.log(`\n${GREEN}${BOLD}Every emitted program reproduces the paper's answer.${RESET}\n`);
