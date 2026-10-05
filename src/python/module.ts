/**
 * `FUNCTION_MODULE` — the reusable Python that builds Q from a constrained
 * model, rather than carrying a pre-computed Q as a literal.
 *
 * ⚠️ **SYNC CONSTRAINT.** This is a line-by-line port of `src/derive.ts`
 * (`deriveModel` / `expandSlack`), `src/reduce.ts` (`clausePolynomial` /
 * `reduceHigherOrder`) and `src/qubo.ts` (`QuboBuilder.addSquaredLinear` /
 * `slackWeights` / `autoSlackBound`).
 * Changing the derivation on the TypeScript side REQUIRES updating this string.
 *
 * `npm run verify:python` guards the invariant: it executes this module under
 * the system Python against every catalogued case and asserts the Q it
 * produces equals the TypeScript-derived Q, and also the Q printed in the paper
 * wherever the paper prints one. A drift
 * fails the build rather than silently shipping two different tutorials.
 */

export const FUNCTION_MODULE = String.raw`import math
from itertools import combinations


def _slack_weights(bound):
    """Binary expansion weights for a slack variable with the given bound.

    Plain powers of two, exactly as the paper does it (§5.3, p.25):
    0 <= s3 <= 6  =>  s3 = 1*x8 + 2*x9 + 4*x10, accepting that three bits
    reach 7 and so slightly over-cover the stated bound of 6.
    """
    if bound <= 0:
        return []
    bits = int(math.floor(math.log2(bound))) + 1
    return [2 ** k for k in range(bits)]


def _auto_slack_bound(coeffs, rel, rhs):
    """Widest slack activity the row itself admits.

    The paper picks its bounds by inspection instead ("estimating a reasonable
    value for how large the slack activity could be", p.25), so this is only a
    fallback and a point of comparison.
    """
    lo = sum(a for a in coeffs if a < 0)
    hi = sum(a for a in coeffs if a > 0)
    bound = rhs - lo if rel == "<=" else hi - rhs
    return max(0, bound)


def _clause_polynomial(clause):
    """Expand a clause's penalty, the product of its "is false" indicators.

    x_v is false <=> (1 - x_v);  ~x_v is false <=> x_v.  Variables are
    idempotent (x*x = x), so a repeated variable merges, and x_v OR ~x_v
    cancels to nothing. Returns [(vars, coef)] with vars sorted ascending.
    Port of clausePolynomial() in src/reduce.ts; insertion order matters.
    """
    poly = {(): 1}
    for v, negated in clause:
        constant, linear = (0, 1) if negated else (1, -1)
        nxt = {}
        for vars_, coef in poly.items():
            merged = vars_ if v in vars_ else tuple(sorted(vars_ + (v,)))
            for key, c in ((vars_, coef * constant), (merged, coef * linear)):
                if c == 0:
                    continue
                nxt[key] = nxt.get(key, 0) + c
        poly = nxt
    return [(list(k), c) for k, c in poly.items() if c != 0]


def _reduce_higher_order(terms, first_aux):
    """Rosenberg's reduction (§7 point 4): bring every term to degree <= 2.

    Terms are taken first-in first-out; in each, the two LOWEST variable
    indices a, b are replaced by an auxiliary y = x_a * x_b (reused if that
    pair was substituted before). Returns (terms, aux) with aux entries
    [index, a, b, load]. Port of reduceHigherOrder() in src/reduce.ts.
    """
    aux = []
    by_pair = {}
    out = {}
    queue = [(list(v), c) for v, c in terms]
    while queue:
        vars_, coef = queue.pop(0)
        if coef == 0:
            continue
        if len(vars_) <= 2:
            key = tuple(vars_)
            out[key] = out.get(key, 0) + coef
            continue
        a, b, rest = vars_[0], vars_[1], vars_[2:]
        y = by_pair.get((a, b))
        if y is None:
            y = [first_aux + len(aux), a, b, 0]
            aux.append(y)
            by_pair[(a, b)] = y
        y[3] += abs(coef)
        queue.append((sorted(rest + [y[0]]), coef))
    return [(list(k), c) for k, c in out.items() if c != 0], aux


def build_qubo(model, P=1):
    """Recast a constrained 0/1 model into QUBO form.

    The model argument is a dict:
        sense       "min" | "max"
        num_vars    number of ORIGINAL decision variables
        linear      [c_j]                        objective linear coefficients
        quadratic   [[i, j, coef], ...]          objective quadratic terms, i < j
        constraints [{coeffs, rel, rhs, method, slack_bound}]
        clauses     [[[v, negated], ...], ...]   objective = number of violated clauses
        cut_edges   [[i, j], ...]                          (Max-Cut only)

    Returns (Q, constant, n) where Q is the FULL SYMMETRIC matrix, so a
    quadratic term c*x_i*x_j contributes c/2 to both Q[i][j] and Q[j][i].
    Recover the original objective with  y = x^T Q x + constant.
    """
    sense = model.get("sense", "min")
    # Minimising ADDS penalties; maximising SUBTRACTS them (§5.3, §5.5).
    sign = 1 if sense == "min" else -1
    constraints = model.get("constraints", []) or []

    # ---- slack expansion -------------------------------------------------
    rows = [list(c["coeffs"]) for c in constraints]
    n = model["num_vars"]
    for k, c in enumerate(constraints):
        if c["method"] != "transform1" or c["rel"] == "=":
            continue
        used = c.get("slack_bound")
        if used is None:
            used = _auto_slack_bound(c["coeffs"], c["rel"], c["rhs"])
        # "<=" adds slack, ">=" subtracts surplus.
        s = 1 if c["rel"] == "<=" else -1
        for w in _slack_weights(used):
            for r, rowk in enumerate(rows):
                rowk.append(s * w if r == k else 0)
            n += 1
    for rowk in rows:
        while len(rowk) < n:
            rowk.append(0)

    # ---- clauses: expand first, then reduce degree >= 3 -------------------
    # Done before Q exists because auxiliary variables enlarge it, and after
    # summing every clause so that cubic terms can cancel before substitution.
    clause_low = []
    high = {}
    for cl in model.get("clauses", []) or []:
        low = []
        for vars_, coef in _clause_polynomial(cl):
            if len(vars_) <= 2:
                low.append((vars_, coef))
            else:
                key = tuple(vars_)
                high[key] = high.get(key, 0) + coef
        clause_low.append(low)
    reduced, aux = _reduce_higher_order(
        [(list(k), c) for k, c in high.items() if c != 0], n
    )
    n += len(aux)
    for rowk in rows:
        while len(rowk) < n:
            rowk.append(0)

    Q = [[0.0] * n for _ in range(n)]
    state = {"constant": 0.0}

    def add_linear(j, c):
        # Binary variables satisfy x = x**2, so linear terms live on the diagonal.
        Q[j][j] += c

    def add_quadratic(i, j, c):
        if c == 0:
            return
        if i == j:
            add_linear(i, c)
            return
        Q[i][j] += c / 2.0
        Q[j][i] += c / 2.0

    def add_squared_linear(coeffs, b, p):
        """Transformation #1: add p * (sum a_j x_j - b)**2.

        Expanding with x**2 = x gives
            p * sum_j (a_j**2 - 2*b*a_j) * x_j
          + p * sum_{i<j} 2*a_i*a_j * x_i x_j
          + p * b**2
        """
        for j, a in enumerate(coeffs):
            if a == 0:
                continue
            add_linear(j, p * (a * a - 2 * b * a))
        for i in range(len(coeffs)):
            if coeffs[i] == 0:
                continue
            for j in range(i + 1, len(coeffs)):
                if coeffs[j] == 0:
                    continue
                add_quadratic(i, j, 2 * p * coeffs[i] * coeffs[j])
        state["constant"] += p * b * b

    # ---- objective -------------------------------------------------------
    cut_edges = model.get("cut_edges")
    if cut_edges:
        # x_i + x_j - 2*x_i*x_j is 1 exactly when the edge is cut (§3.2).
        for i, j in cut_edges:
            add_linear(i, 1)
            add_linear(j, 1)
            add_quadratic(i, j, -2)
    else:
        for j, c in enumerate(model.get("linear", []) or []):
            add_linear(j, c)
        for i, j, coef in model.get("quadratic", []) or []:
            add_quadratic(i, j, coef)

    def add_term(vars_, c):
        if len(vars_) == 0:
            state["constant"] += c
        elif len(vars_) == 1:
            add_linear(vars_[0], c)
        else:
            add_quadratic(vars_[0], vars_[1], c)

    # ---- clauses ---------------------------------------------------------
    # Each violated clause counts 1 -- the clauses ARE the objective, so P
    # never scales them. For two literals the expansion reproduces all three
    # rows of the p.15 table.
    for low in clause_low:
        for vars_, c in low:
            add_term(vars_, c)

    # ---- higher-order reduction (§7 point 4) -----------------------------
    # x_a x_b -> y, plus P(x_a x_b - 2 x_a y - 2 x_b y + 3y): zero exactly
    # when y = x_a x_b, at least P otherwise.
    if aux:
        for vars_, c in reduced:
            add_term(vars_, c)
        pk = sign * P
        for idx, a, b, _load in aux:
            add_quadratic(a, b, pk)
            add_quadratic(a, idx, -2 * pk)
            add_quadratic(b, idx, -2 * pk)
            add_linear(idx, 3 * pk)

    # ---- constraint penalties -------------------------------------------
    for k, c in enumerate(constraints):
        pk = sign * P
        method = c["method"]
        sup = [j for j, a in enumerate(c["coeffs"]) if a != 0]

        if method == "transform1":
            add_squared_linear(rows[k], c["rhs"], pk)
        elif method == "transform2":
            # sum_{j in S} x_j <= 1  =>  P * sum_{i<j in S} x_i x_j
            for i, j in combinations(sup, 2):
                add_quadratic(i, j, pk)
        elif method == "atLeastOne":
            # x_i + x_j >= 1  =>  P(1 - x_i - x_j + x_i x_j)
            i, j = sup
            state["constant"] += pk
            add_linear(i, -pk)
            add_linear(j, -pk)
            add_quadratic(i, j, pk)
        elif method == "exactlyOne2":
            # x_i + x_j = 1  =>  P(1 - x_i - x_j + 2 x_i x_j)
            i, j = sup
            state["constant"] += pk
            add_linear(i, -pk)
            add_linear(j, -pk)
            add_quadratic(i, j, 2 * pk)
        elif method == "implication":
            # x_i <= x_j  =>  P(x_i - x_i x_j)
            i, j = sup
            add_linear(i, pk)
            add_quadratic(i, j, -pk)
        elif method == "equal2":
            # x_i = x_j  =>  P(x_i + x_j - 2 x_i x_j)
            i, j = sup
            add_linear(i, pk)
            add_linear(j, pk)
            add_quadratic(i, j, -2 * pk)
        else:
            raise ValueError("unknown penalty method: %s" % method)

    return Q, state["constant"], n


def to_qubo_dict(Q):
    """Symmetric Q -> the upper-triangular dict dimod expects.

    x^T Q x = sum_i q_ii x_i + sum_{i<j} 2*q_ij x_i x_j, so the off-diagonal
    coefficient handed to dimod is 2*q_ij, not q_ij.
    """
    n = len(Q)
    out = {}
    for i in range(n):
        if Q[i][i]:
            out[(i, i)] = Q[i][i]
        for j in range(i + 1, n):
            c = Q[i][j] + Q[j][i]
            if c:
                out[(i, j)] = c
    return out


def evaluate(Q, x):
    """x^T Q x for a 0/1 assignment."""
    n = len(Q)
    y = 0.0
    for i in range(n):
        if not x[i]:
            continue
        y += Q[i][i]
        for j in range(i + 1, n):
            if x[j]:
                y += 2 * Q[i][j]
    return y
`;
