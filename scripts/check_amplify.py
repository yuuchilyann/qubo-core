"""Run every emitted amplify-da4 program against the REAL Fixstars Amplify.

Called by `npm run check:amplify`, which writes the programs and an index.json
into the directory given as the only argument.

Only amplify.solve is replaced (no Fujitsu token): it enumerates assignments of
the real Model's variables, keeps those satisfying every real Constraint
(Constraint.is_satisfied), minimises the real objective (Poly.evaluate), and
returns an object shaped like Amplify's result with a real amplify.Values.
Everything else — VariableGenerator, Poly, one_hot / equal_to / less_equal /
greater_equal, weights, Model construction, FujitsuDA4Client and its
attributes, PolyArray.evaluate — is the real library.

It also runs Amplify's own local conversion, model.to_unconstrained_poly(),
which must accept every model. A program passes when it prints the reference
answer: the paper's (or the constrained search's) x^T Q x and original y for
tier 1, the original y with every declared constraint holding for tier 2.
"""
import io, itertools, json, os, sys, time, traceback, contextlib
import amplify

DIR = sys.argv[1]
index = json.load(open(os.path.join(DIR, 'index.json')))

seen = {}


class _FakeValues:
    """Stands in for amplify.Values, which only a real solve can create."""
    def __init__(self, mapping):
        self.mapping = mapping


def _value(poly, mapping):
    # Real Amplify arithmetic: substitute every variable, read the constant.
    # Binary variables absent from the mapping take 0, as evaluate() documents.
    # Keyed by variable id: Amplify hands out a fresh Python object per access.
    full = {v: mapping.get(v.id, 0) for v in poly.variables}
    return float(poly.substitute(full)) if full else float(poly)


_real_array_evaluate = amplify.PolyArray.evaluate
def _array_evaluate(self, values, *args):
    if isinstance(values, _FakeValues):
        return [_value(p, values.mapping) for p in self.to_list()]
    return _real_array_evaluate(self, values, *args)
amplify.PolyArray.evaluate = _array_evaluate


class _Best:
    def __init__(self, values):
        self.values = values


class _Result:
    def __init__(self, values):
        self.best = _Best(values)


def fake_solve(model, client):
    assert isinstance(client, amplify.FujitsuDA4Client), type(client)
    assert isinstance(client.token, str)
    flags = {f: getattr(client, f) for f in
             ['set_penalty_binary_polynomial', 'set_inequalities',
              'set_one_way_one_hot_groups', 'set_two_way_one_hot_groups']}
    seen['flags'] = flags
    seen['time_limit'] = client.parameters.time_limit_sec
    # Amplify's own local conversion must accept the model.
    seen['unconstrained_degree'] = model.to_unconstrained_poly().degree()
    vs = list(model.variables)
    best_vals, best_e = None, None
    for bits in itertools.product((0, 1), repeat=len(vs)):
        vals = {v: b for v, b in zip(vs, bits)}
        if not all(c.is_satisfied(vals) for c in model.constraints):
            continue
        e = _value(model.objective, {v.id: b for v, b in vals.items()})
        if best_e is None or e < best_e:
            best_vals, best_e = {v.id: b for v, b in vals.items()}, e
    assert best_vals is not None, 'no feasible assignment'
    seen['n_vars'] = len(vs)
    seen['n_constraints'] = len(model.constraints)
    return _Result(_FakeValues(best_vals))


amplify.solve = fake_solve

ok = fail = 0
for item in index:
    seen.clear()
    src = open(os.path.join(DIR, item['file']), encoding='utf-8').read()
    g = {'__name__': '__main__'}
    out = io.StringIO()
    t0 = time.time()
    try:
        with contextlib.redirect_stdout(out):
            exec(compile(src, item['file'], 'exec'), g)
        problems = []
        if item['tier'] == 1:
            if g['y_qubo'] != item['yQubo']:
                problems.append(f"y_qubo {g['y_qubo']} != {item['yQubo']}")
        else:
            if g['feasible'] is not True:
                problems.append('infeasible')
        if g['y_original'] != item['yOriginal']:
            problems.append(f"y_original {g['y_original']} != {item['yOriginal']}")
        status = 'ok' if not problems else 'FAIL ' + '; '.join(problems)
    except Exception:
        status = 'ERROR ' + traceback.format_exc().strip().splitlines()[-1]
        problems = [status]
    flags = ','.join(k.replace('set_', '') for k, v in seen.get('flags', {}).items() if v)
    print(f"{'✓' if not problems else '✗'} {item['file']:34} {status:40} vars={seen.get('n_vars')} "
          f"cons={seen.get('n_constraints')} deg={seen.get('unconstrained_degree')} [{flags}] {time.time()-t0:.1f}s")
    if problems:
        fail += 1
    else:
        ok += 1
print(f'\n{ok} ok, {fail} failed, amplify {amplify.__version__}')
sys.exit(1 if fail else 0)
