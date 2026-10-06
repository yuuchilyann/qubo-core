/**
 * Executes the emitted Python and checks it prints the paper's answer.
 *
 * For a case the paper only names, "the answer" is the optimum of the original
 * constrained model found by `solveConstrained` — the same reference the
 * emitted program quotes in its expectation comment.
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
 * Two programs are different in kind. `da` carries its own solver, the Digital
 * Annealer's algorithm in plain Python, and it runs FOR REAL here: no stub, the
 * actual anneal has to reach the reference answer. `amplify-da4` calls
 * Fujitsu's DA4 through Fixstars Amplify and cannot run without a Fujitsu
 * token, so it runs against a stub of Amplify that enforces the documented
 * client attributes and treats every constraint as hard. A green line for it
 * proves the program — the constraint translation, the signs, the indexing —
 * and nothing about Fujitsu's service.
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
  [1, 'da'],
  [2, 'da'],
  [1, 'amplify-da4'],
  [2, 'amplify-da4'],
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

# ── amplify ───────────────────────────────────────────────────────────────────
# A stand-in for Fixstars Amplify, enough for the programs emitted for
# FujitsuDA4Client. Polynomials over binary variables (x*x = x), constraints,
# a model, and a solve() that enumerates every assignment and treats each
# constraint as HARD. The client accepts only the attributes Amplify documents,
# so a misspelt flag fails here instead of being silently ignored.
from datetime import timedelta as _timedelta

class _Poly:
    def __init__(self, terms=None):
        self.t = dict(terms or {})
    @staticmethod
    def of(v):
        return v if isinstance(v, _Poly) else _Poly({frozenset(): v})
    def __add__(self, o):
        o = _Poly.of(o)
        if not isinstance(o, _Poly):
            return NotImplemented
        t = dict(self.t)
        for k, c in o.t.items():
            t[k] = t.get(k, 0) + c
        return _Poly(t)
    __radd__ = __add__
    def __neg__(self):
        return _Poly({k: -c for k, c in self.t.items()})
    def __sub__(self, o):
        return self + (-_Poly.of(o))
    def __rsub__(self, o):
        return _Poly.of(o) + (-self)
    def __mul__(self, o):
        o = _Poly.of(o)
        t = {}
        for a, ca in self.t.items():
            for b, cb in o.t.items():
                k = a | b
                t[k] = t.get(k, 0) + ca * cb
        return _Poly(t)
    __rmul__ = __mul__
    def value(self, x):
        return sum(c for k, c in self.t.items() if all(x[i] for i in k))

class _Array(list):
    def evaluate(self, values):
        return [values[i] for i in range(len(self))]

class _Generator:
    def __init__(self):
        self.n = 0
    def array(self, kind, n):
        assert kind == "Binary", kind
        start, self.n = self.n, self.n + n
        return _Array(_Poly({frozenset([start + i]): 1}) for i in range(n))

class _Constraint:
    def __init__(self, lhs, rel, rhs, label):
        self.lhs, self.rel, self.rhs, self.label, self.weight = _Poly.of(lhs), rel, rhs, label, 1
    def holds(self, x):
        v = self.lhs.value(x)
        return v == self.rhs if self.rel == "=" else v <= self.rhs if self.rel == "<=" else v >= self.rhs
    def __add__(self, o):
        return _ConstraintList([self]) + o

class _ConstraintList:
    def __init__(self, items):
        self.items = list(items)
    def __add__(self, o):
        return _ConstraintList(self.items + (o.items if isinstance(o, _ConstraintList) else [o]))

class _Model:
    def __init__(self, objective, constraints=None):
        self.objective = _Poly.of(objective)
        self.constraints = constraints.items if isinstance(constraints, _ConstraintList) else (
            [constraints] if constraints else [])

_poly_plain_add = _Poly.__add__
def _poly_add_constraints(self, o):
    if isinstance(o, (_Constraint, _ConstraintList)):
        return _Model(self, o)
    return _poly_plain_add(self, o)
_Poly.__add__ = _poly_add_constraints

def one_hot(lhs, label=None):
    return _Constraint(lhs, "=", 1, label)
def equal_to(lhs, rhs, label=None):
    return _Constraint(lhs, "=", rhs, label)
def less_equal(lhs, rhs, label=None):
    return _Constraint(lhs, "<=", rhs, label)
def greater_equal(lhs, rhs, label=None):
    return _Constraint(lhs, ">=", rhs, label)

class _Params:
    def __setattr__(self, k, v):
        assert k == "time_limit_sec", "unknown parameter " + k
        assert isinstance(v, _timedelta), "time_limit_sec must be a timedelta"
        object.__setattr__(self, k, v)

class FujitsuDA4Client:
    _known = {"token", "set_penalty_binary_polynomial", "set_inequalities",
              "set_one_way_one_hot_groups", "set_two_way_one_hot_groups"}
    def __init__(self):
        object.__setattr__(self, "parameters", _Params())
    def __setattr__(self, k, v):
        assert k in self._known, "unknown client attribute " + k
        object.__setattr__(self, k, v)

class _Best:
    def __init__(self, values):
        self.values = values
class _Result:
    def __init__(self, values):
        self.best = _Best(values)

def solve(model, client):
    assert isinstance(client, FujitsuDA4Client)
    assert isinstance(getattr(client, "token", None), str), "token not set"
    obj = [(tuple(k), c) for k, c in model.objective.t.items()]
    n = 1 + max([i for k, _ in obj for i in k] + [i for con in model.constraints for k in con.lhs.t for i in k] + [-1])
    best, best_e = None, None
    for bits in itertools.product((0, 1), repeat=n):
        if not all(con.holds(bits) for con in model.constraints):
            continue
        e = sum(c for k, c in obj if all(bits[i] for i in k))
        if best_e is None or e < best_e:
            best, best_e = bits, e
    assert best is not None, "no feasible assignment"
    return _Result({i: best[i] for i in range(n)})

_amp = types.ModuleType("amplify")
_amp.VariableGenerator = _Generator
_amp.Poly = _Poly
_amp.Model = _Model
_amp.solve = solve
_amp.FujitsuDA4Client = FujitsuDA4Client
_amp.one_hot = one_hot
_amp.equal_to = equal_to
_amp.less_equal = less_equal
_amp.greater_equal = greater_equal
sys.modules["amplify"] = _amp

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
_real_print(json.dumps({"x": x, "y_qubo": globals().get("y_qubo"), "y_original": y_original,
                        "feasible": globals().get("feasible")}))
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
  const { CATALOG } = await server.ssrLoadModule('/src/cases/index.ts');
  const { solveConstrained } = await server.ssrLoadModule('/src/constrained.ts');
  const { derive } = await server.ssrLoadModule('/src/derive.ts');
  const { emitTier1, emitTier2 } = await server.ssrLoadModule('/src/python/emit.ts');

  console.log(`\n${BOLD}Emitted Python — does it actually reproduce the reference answer?${RESET}`);
  console.log(`${DIM}stub dimod, no packages installed; both tiers executed verbatim${RESET}\n`);

  // Fail fast if Python is unavailable rather than reporting a false pass.
  try {
    await runPython('print(1)');
  } catch (e) {
    console.log(`${YELLOW}SKIP${RESET}  cannot run Python (${PY}): ${String(e.message).split('\n')[0]}\n`);
    await server.close();
    process.exit(0);
  }

  for (const qcase of CATALOG) {
    const { model } = derive(qcase);
    let expect;
    if (qcase.source === 'worked') {
      expect = qcase.paperSolution;
    } else {
      const best = solveConstrained(qcase.model).best;
      expect = { yQubo: best - model.constant, yOriginal: best };
    }
    const ref = qcase.source === 'worked' ? 'paper' : 'searched';

    for (const [tier, sampler] of TIER_SAMPLERS) {
      const body = tier === 1 ? emitTier1(qcase, model, sampler) : emitTier2(qcase, model, sampler);
      const source = `${DIMOD_STUB}\n${body}\n${REPORT}`;

      let got;
      try {
        const raw = await runPython(source);
        got = JSON.parse(raw.trim().split('\n').pop());
      } catch (e) {
        console.log(
          `  ${RED}✗${RESET} ${qcase.section.padEnd(6)} tier ${tier} ${sampler.padEnd(11)} ${RED}${String(e.message).trim().split('\n').slice(-1)[0]}${RESET}`,
        );
        failed++;
        continue;
      }

      const problems = [];
      // The native Amplify program has no single Q: it reports the original
      // objective and whether every declared constraint holds.
      const native = tier === 2 && sampler === 'amplify-da4';
      if (native) {
        if (got.feasible !== true) problems.push('constraints violated');
      } else if (got.y_qubo !== expect.yQubo) {
        problems.push(`xᵀQx=${got.y_qubo} ${ref}=${expect.yQubo}`);
      }
      if (got.y_original !== expect.yOriginal) {
        problems.push(`original=${got.y_original} ${ref}=${expect.yOriginal}`);
      }
      // Degenerate optima mean a different x can be equally correct, so the
      // assignment is only required to ATTAIN the paper's value, not equal its x.
      if (!native && got.x.length !== model.n) problems.push(`|x|=${got.x.length} expected ${model.n}`);

      const ok = problems.length === 0;
      console.log(
        `  ${ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`} ${qcase.section.padEnd(6)} tier ${tier} ${sampler.padEnd(11)} ` +
          `${DIM}${native ? 'native' : `xᵀQx=${got.y_qubo}`} original=${got.y_original}${RESET}` +
          (ok ? '' : `  ${RED}${problems.join('; ')}${RESET}`),
      );
      if (!ok) failed++;
    }
  }
} finally {
  await server.close();
}

if (failed) {
  console.log(`\n${RED}${BOLD}${failed} emitted program(s) did not reproduce the reference answer.${RESET}\n`);
  process.exit(1);
}
console.log(`\n${GREEN}${BOLD}Every emitted program reproduces its reference: the paper's answer, or the constrained search where the paper prints none.${RESET}\n`);
