/**
 * Python emitters.
 *
 * Two tiers, mirroring the two levels of abstraction the paper itself works at:
 *
 *   **Tier 1 — "this one problem".** Carries Q as a literal and calls a sampler.
 *   The numbers come from the same derivation the page is displaying, so there
 *   is nothing to drift.
 *
 *   **Tier 2 — "the modelling function".** Ships `build_qubo()` and the original
 *   constrained model, and derives Q inside Python. This is what the paper is
 *   actually teaching, and it is the only artefact with a TS↔Python sync
 *   obligation — guarded by `npm run verify:python`.
 */

import type { QuboCase, QuboModel } from '../types';
import { toUpperTriangular } from '../qubo';
import { FUNCTION_MODULE } from './module';
import { findSampler, type SamplerId } from './samplers';
import { pyRepr, toPythonModel } from './serialize';

export type NotebookCell = { source: string };

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
}

function header(qcase: QuboCase, P: number, extra = ''): string {
  const [a, b] = qcase.pages;
  const pages = a === b ? `p.${a}` : `pp.${a}–${b}`;
  return `"""QUBO Model Explorer — ${qcase.section} ${qcase.id} (${pages})

Glover, Kochenberger & Du, "A Tutorial on Formulating and Using QUBO Models".
${qcase.penalty ? `Penalty scalar P = ${num(P)}.` : 'This model needs no penalty scalar.'}${
    extra ? `\n${extra}` : ''
  }
"""`;
}

/** `{(i, j): c, …}` wrapped at a readable width. */
function quboDictLiteral(model: QuboModel): string {
  const upper = toUpperTriangular(model.Q);
  const entries: string[] = [];
  for (let i = 0; i < upper.length; i++) {
    for (let j = i; j < upper.length; j++) {
      if (upper[i][j] !== 0) entries.push(`(${i}, ${j}): ${num(upper[i][j])}`);
    }
  }
  const lines: string[] = [];
  let line = '';
  for (const e of entries) {
    const next = line ? `${line} ${e},` : `    ${e},`;
    if (next.length > 88) {
      lines.push(line);
      line = `    ${e},`;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return `{\n${lines.join('\n')}\n}`;
}

const SOLVE_AND_REPORT = (samplerId: SamplerId) => {
  const s = findSampler(samplerId);
  return `# dimod always MINIMISES, so a maximisation is submitted negated and the
# reported energy is flipped back.
qubo = Q if SENSE == "min" else {k: -v for k, v in Q.items()}
bqm = dimod.BinaryQuadraticModel.from_qubo(qubo)

sampler = ${s.construct}
sampleset = sampler.sample(bqm${s.sampleArgs ? `, ${s.sampleArgs}` : ''})

best = sampleset.first
x = [int(best.sample[i]) for i in range(N)]
y_qubo = best.energy if SENSE == "min" else -best.energy
y_original = y_qubo + OFFSET

print("x          =", x)
print("x^T Q x    =", y_qubo)
print("original y =", y_original)`;
};

/**
 * The expected output block.
 *
 * Once the reader has edited the input data, `paperSolution` describes a
 * different problem, so quoting it would be actively misleading — the emitted
 * script says so instead of printing numbers that will not appear.
 */
function expectation(qcase: QuboCase): string {
  if (qcase.custom) {
    return `# Custom input: this model no longer matches ${qcase.section} of the paper,
# so there is no published answer to compare against.`;
  }
  const { x, yQubo, yOriginal } = qcase.paperSolution;
  return `# Expected, per the paper (${qcase.section}):
#   x          = [${x.join(', ')}]
#   x^T Q x    = ${yQubo}
#   original y = ${yOriginal}`;
}

/** Tier 1 — Q as a literal. */
export function emitTier1(
  qcase: QuboCase,
  model: QuboModel,
  samplerId: SamplerId,
): string {
  const s = findSampler(samplerId);
  return [
    header(qcase, model.P),
    s.imports.join('\n'),
    '',
    `N = ${model.n}`,
    `SENSE = "${model.sense}"`,
    `OFFSET = ${num(model.constant)}  # additive constant dropped during the recast`,
    '',
    '# Upper-triangular QUBO coefficients: {(i, j): coefficient}',
    `Q = ${quboDictLiteral(model)}`,
    '',
    SOLVE_AND_REPORT(samplerId),
    '',
    expectation(qcase),
    '',
  ].join('\n');
}

/**
 * Serialise the ORIGINAL constrained model as a Python dict literal.
 *
 * Rendered from the same `toPythonModel()` object the cross-verification script
 * feeds to Python, so the bytes the user copies are the bytes that were checked.
 */
export function emitModelLiteral(qcase: QuboCase): string {
  return `MODEL = ${pyRepr(toPythonModel(qcase))}`;
}

/** Tier 2 — derive Q inside Python from the original constrained model. */
export function emitTier2(
  qcase: QuboCase,
  model: QuboModel,
  samplerId: SamplerId,
): string {
  const s = findSampler(samplerId);
  return [
    header(
      qcase,
      model.P,
      'Q is DERIVED here rather than pasted in, so the same code handles any\nmodel of this shape — which is what the tutorial is really teaching.',
    ),
    s.imports.join('\n'),
    '',
    '',
    FUNCTION_MODULE.trimEnd(),
    '',
    '',
    '# ── the original constrained model, exactly as the paper states it ──',
    emitModelLiteral(qcase),
    '',
    `Q_sym, OFFSET, N = build_qubo(MODEL, P=${num(model.P)})`,
    `SENSE = MODEL["sense"]`,
    'Q = to_qubo_dict(Q_sym)',
    '',
    SOLVE_AND_REPORT(samplerId),
    '',
    expectation(qcase),
    '',
  ].join('\n');
}

/** Notebook form: install, then the script, split so cells can be re-run. */
export function buildNotebook(
  qcase: QuboCase,
  model: QuboModel,
  samplerId: SamplerId,
  tier: 1 | 2,
  installPackages: string[],
): NotebookCell[] {
  const s = findSampler(samplerId);
  const cells: NotebookCell[] = [
    // Colab needs the `!` prefix; the shell block above the script does not.
    { source: `!pip install ${[...new Set(installPackages)].join(' ')}` },
  ];

  if (s.needsToken) {
    cells.push({
      source: `# This sampler needs a D-Wave Leap account. In Colab, set the token as an
# environment variable before running the cells below.
import os
os.environ["DWAVE_API_TOKEN"] = "paste your token here"`,
    });
  }

  if (tier === 1) {
    cells.push({
      source: [
        header(qcase, model.P),
        s.imports.join('\n'),
        '',
        `N = ${model.n}`,
        `SENSE = "${model.sense}"`,
        `OFFSET = ${num(model.constant)}`,
        '',
        `Q = ${quboDictLiteral(model)}`,
      ].join('\n'),
    });
  } else {
    cells.push({ source: [s.imports.join('\n'), '', FUNCTION_MODULE.trimEnd()].join('\n') });
    cells.push({
      source: [
        emitModelLiteral(qcase),
        '',
        `Q_sym, OFFSET, N = build_qubo(MODEL, P=${num(model.P)})`,
        `SENSE = MODEL["sense"]`,
        'Q = to_qubo_dict(Q_sym)',
      ].join('\n'),
    });
  }

  cells.push({ source: [SOLVE_AND_REPORT(samplerId), '', expectation(qcase)].join('\n') });
  return cells;
}

/** Serialise cells into a minimal but valid `.ipynb`. */
export function buildIpynb(cells: NotebookCell[]): string {
  return JSON.stringify(
    {
      cells: cells.map((c) => ({
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        // Jupyter stores sources as a line array with trailing newlines.
        source: c.source.split('\n').map((l, i, a) => (i === a.length - 1 ? l : `${l}\n`)),
      })),
      metadata: {
        kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
        language_info: { name: 'python', version: '3' },
      },
      nbformat: 4,
      nbformat_minor: 5,
    },
    null,
    1,
  );
}
