/**
 * The Digital Annealer's algorithm as a standalone Python function, embedded in
 * the programs the `da` sampler emits.
 *
 * A port of `samplers/digitalAnnealer.ts` (Aramon et al. 2019, Algorithm 2):
 * parallel trial, the dynamic offset, the same default temperatures and offset
 * step. It uses only the standard library, so a reader with no account and no
 * packages can run it. The PRNG is Python's `random.Random`, not the site's
 * mulberry32, so individual runs differ from the browser's; the method does not.
 *
 * `verify:emit` executes it for real — there is no stub standing in for it — and
 * requires every case to reach its reference answer.
 */

export const DA_FUNCTION = `def digital_annealer(Q, n, sense="min", runs=16, sweeps=200, seed=1):
    """Fujitsu Digital Annealer algorithm (Aramon et al. 2019, Algorithm 2).

    Simulated annealing with two changes: every step tests a flip of ALL n
    variables and applies one accepted flip chosen at random (parallel trial);
    a step that accepts nothing raises an energy offset until something is
    accepted (dynamic offset). This is the published algorithm, not Fujitsu's
    hardware. Q is upper-triangular {(i, j): c}; returns the best x found.
    """
    s = 1 if sense == "min" else -1          # work as a minimisation
    lin = [0.0] * n
    nbr = [[] for _ in range(n)]             # c * x_i * x_j, stored both ways
    for (i, j), c in Q.items():
        if i == j:
            lin[i] += s * c
        elif c:
            nbr[i].append((j, s * c))
            nbr[j].append((i, s * c))

    # Hot enough that the largest uphill move is accepted half the time, cold
    # enough that the smallest is accepted 1% of the time.
    d_max = max([abs(lin[k]) + sum(abs(c) for _, c in nbr[k]) for k in range(n)] + [0]) or 1.0
    sizes = [abs(v) for v in lin if v] + [abs(c) for k in range(n) for _, c in nbr[k]]
    d_min = min(sizes) if sizes else 1.0
    t_start, t_end, rise = d_max / math.log(2), d_min / math.log(100), d_min
    steps = max(1, sweeps * n)
    cool = (t_end / t_start) ** (1 / (steps - 1)) if steps > 1 else 1.0

    rng = random.Random(seed)
    best_x, best_e = None, None
    for _ in range(runs):
        x = [rng.randrange(2) for _ in range(n)]
        g = [lin[k] + sum(c for j, c in nbr[k] if x[j]) for k in range(n)]
        e = sum(lin[k] for k in range(n) if x[k]) + sum(
            c for k in range(n) if x[k] for j, c in nbr[k] if j > k and x[j]
        )
        run_x, run_e = x[:], e
        offset, t = 0.0, t_start
        for _ in range(steps):
            accepted = []
            for k in range(n):
                d = (g[k] if x[k] == 0 else -g[k]) - offset
                if d <= 0 or rng.random() < math.exp(-d / t):
                    accepted.append(k)
            if accepted:
                m = rng.choice(accepted)
                dx = 1 - 2 * x[m]
                e += g[m] * dx
                x[m] ^= 1
                for j, c in nbr[m]:
                    g[j] += c * dx
                offset = 0.0
                if e < run_e:
                    run_x, run_e = x[:], e
            else:
                offset += rise
            t *= cool
        if best_e is None or run_e < best_e:
            best_x, best_e = run_x, run_e
    return best_x
`;
