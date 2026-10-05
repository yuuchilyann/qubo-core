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

import type { CatalogCase, ConstrainedModel, QuboModel } from '../types';
import { CONSTRAINED_LIMIT, solveConstrained } from '../constrained';
import { toUpperTriangular } from '../qubo';
import { FUNCTION_MODULE } from './module';
import { findSampler, type SamplerId } from './samplers';
import { pyRepr, toPythonModel } from './serialize';

export type NotebookCell = { source: string };

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
}

/**
 * Everything the emitters need that is not the model itself.
 *
 * Introduced so a model assembled at runtime can be emitted without inventing
 * a catalogue entry around it — which would mean fabricating a section number,
 * a page range and a published solution it does not have. The caller supplies
 * its own labels; this module has no opinion about who is asking or whose
 * claim an expected answer is.
 */
export type EmitContext = {
  /** First line of the docstring. */
  title: string;
  /** Attribution, when the model comes from a published source. */
  credit?: string | null;
  /** `null` when the model has no constraints and P is meaningless. */
  penalty?: number | null;
  /** What the program should print, and whose claim that is. */
  expectation?: Expectation;
};

export type Expectation =
  | { kind: 'answer'; label: string; x: number[]; yQubo: number; yOriginal: number }
  | { kind: 'none'; note: string };

const CREDIT = 'Glover, Kochenberger & Du, "A Tutorial on Formulating and Using QUBO Models".';

function pageLabel(pages: [number, number]): string {
  const [a, b] = pages;
  return a === b ? `p.${a}` : `pp.${a}–${b}`;
}

/**
 * The context a catalogued case implies. Keeps the published output identical
 * for the worked examples.
 *
 * A mentioned case has no published answer, so its expectation is computed by
 * searching the original constrained model — and labelled as exactly that, so
 * the program never attributes to the paper a number the paper does not print.
 */
function contextFor(qcase: CatalogCase, model: QuboModel): EmitContext {
  const pages = pageLabel(qcase.pages);
  const penalty = qcase.penalty ? model.P : null;

  if (qcase.source === 'mentioned') {
    return {
      title: `QUBO Model Explorer — ${qcase.id} (named in ${qcase.section}, ${pages})`,
      credit: `Problem named in ${CREDIT}
The paper works no example of it; this instance is not from the paper.`,
      penalty,
      expectation: qcase.custom
        ? { kind: 'none', note: 'Custom input: there is no reference answer to compare against.' }
        : searchedExpectation(qcase, model),
    };
  }

  return {
    title: `QUBO Model Explorer — ${qcase.section} ${qcase.id} (${pages})`,
    credit: CREDIT,
    penalty,
    expectation: qcase.custom
      ? {
          kind: 'none',
          note: `Custom input: this model no longer matches ${qcase.section} of the paper,
so there is no published answer to compare against.`,
        }
      : {
          kind: 'answer',
          label: `per the paper (${qcase.section})`,
          x: qcase.paperSolution.x,
          yQubo: qcase.paperSolution.yQubo,
          yOriginal: qcase.paperSolution.yOriginal,
        },
  };
}

/** Expectation from exhaustive search of the original model; `x` covers decision variables only. */
function searchedExpectation(qcase: CatalogCase, model: QuboModel): Expectation {
  if (qcase.model.numVars > CONSTRAINED_LIMIT) {
    return { kind: 'none', note: 'Too many variables to compute a reference answer here.' };
  }
  const ref = solveConstrained(qcase.model);
  if (ref.best === null) {
    return { kind: 'none', note: 'The original model has no feasible assignment.' };
  }
  return {
    kind: 'answer',
    label: 'by exhaustive search of the original constrained model (not from the paper)',
    x: ref.argmins[0],
    yQubo: ref.best - model.constant,
    yOriginal: ref.best,
  };
}

function header(ctx: EmitContext, extra = ''): string {
  const penaltyLine =
    ctx.penalty === null || ctx.penalty === undefined
      ? 'This model needs no penalty scalar.'
      : `Penalty scalar P = ${num(ctx.penalty)}.`;
  const body = [ctx.credit, penaltyLine].filter(Boolean).join('\n');
  return `"""${ctx.title}

${body}${extra ? `\n${extra}` : ''}
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
function expectation(e: Expectation | undefined): string {
  if (!e) return '# No expected answer was supplied.';
  if (e.kind === 'none') {
    return e.note
      .split('\n')
      .map((l) => `# ${l}`)
      .join('\n');
  }
  return `# Expected, ${e.label}:
#   x          = [${e.x.join(', ')}]
#   x^T Q x    = ${e.yQubo}
#   original y = ${e.yOriginal}`;
}

/** Tier 1 for a catalogued case. */
export function emitTier1(qcase: CatalogCase, model: QuboModel, samplerId: SamplerId): string {
  return emitTier1For(contextFor(qcase, model), model, samplerId);
}

/** Tier 1 — Q as a literal. */
export function emitTier1For(
  ctx: EmitContext,
  model: QuboModel,
  samplerId: SamplerId,
): string {
  const s = findSampler(samplerId);
  return [
    header(ctx),
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
    expectation(ctx.expectation),
    '',
  ].join('\n');
}

/**
 * Serialise the ORIGINAL constrained model as a Python dict literal.
 *
 * Rendered from the same `toPythonModel()` object the cross-verification script
 * feeds to Python, so the bytes the user copies are the bytes that were checked.
 */
export function emitModelLiteral(model: ConstrainedModel): string {
  return `MODEL = ${pyRepr(toPythonModel(model))}`;
}

/** Tier 2 for a catalogued case. */
export function emitTier2(qcase: CatalogCase, model: QuboModel, samplerId: SamplerId): string {
  return emitTier2For(contextFor(qcase, model), qcase.model, model, samplerId, {
    modelComment:
      qcase.source === 'worked'
        ? '# ── the original constrained model, exactly as the paper states it ──'
        : '# ── the original constrained model (instance chosen here; the paper gives none) ──',
  });
}

/** Tier 2 — derive Q inside Python from the original constrained model. */
export function emitTier2For(
  ctx: EmitContext,
  constrained: ConstrainedModel,
  model: QuboModel,
  samplerId: SamplerId,
  options: { modelComment?: string } = {},
): string {
  const s = findSampler(samplerId);
  return [
    header(
      ctx,
      'Q is DERIVED here rather than pasted in, so the same code handles any\nmodel of this shape — which is what the tutorial is really teaching.',
    ),
    s.imports.join('\n'),
    '',
    '',
    FUNCTION_MODULE.trimEnd(),
    '',
    '',
    options.modelComment ?? '# ── the original constrained model, before any QUBO recasting ──',
    emitModelLiteral(constrained),
    '',
    `Q_sym, OFFSET, N = build_qubo(MODEL, P=${num(model.P)})`,
    `SENSE = MODEL["sense"]`,
    'Q = to_qubo_dict(Q_sym)',
    '',
    SOLVE_AND_REPORT(samplerId),
    '',
    expectation(ctx.expectation),
    '',
  ].join('\n');
}

/** Notebook form: install, then the script, split so cells can be re-run. */
export function buildNotebook(
  qcase: CatalogCase,
  model: QuboModel,
  samplerId: SamplerId,
  tier: 1 | 2,
  installPackages: string[],
): NotebookCell[] {
  const s = findSampler(samplerId);
  const ctx = contextFor(qcase, model);
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
        header(ctx),
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
        emitModelLiteral(qcase.model),
        '',
        `Q_sym, OFFSET, N = build_qubo(MODEL, P=${num(model.P)})`,
        `SENSE = MODEL["sense"]`,
        'Q = to_qubo_dict(Q_sym)',
      ].join('\n'),
    });
  }

  cells.push({ source: [SOLVE_AND_REPORT(samplerId), '', expectation(ctx.expectation)].join('\n') });
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
