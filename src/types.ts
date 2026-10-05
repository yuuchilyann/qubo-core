/**
 * Domain types for the QUBO Model Explorer.
 *
 * Design rule that governs this whole file: **the Q matrix is never authored by
 * hand**. Every case declares its ORIGINAL constrained model plus the penalty
 * rules the paper applies to it; `lib/derive.ts` computes Q from that. The Q
 * matrix printed in the paper is stored separately (`paperQ`) purely so the app
 * can diff the two and prove the derivation reproduces the publication.
 */

/** Objective direction. Penalties are ADDED when minimising, SUBTRACTED when maximising. */
export type Sense = 'min' | 'max';

/** Constraint relation as written in the paper. */
export type Relation = '<=' | '=' | '>=';

/**
 * How a given constraint is turned into a quadratic penalty.
 *
 * - `transform1`   — the general recipe of §5: `P(a·x − b)²`. Requires an equality,
 *                    so inequalities must first be closed with a slack variable.
 * - `transform2`   — §5's special case for `Σ_{j∈S} x_j ≤ 1` → `P Σ_{i<j∈S} x_i x_j`.
 *                    Covers rows 1 and 5 of the p.10 table.
 * - `atLeastOne`   — row 2 of the p.10 table: `x_i + x_j ≥ 1` → `P(1 − x_i − x_j + x_i x_j)`.
 * - `exactlyOne2`  — row 3: `x_i + x_j = 1` → `P(1 − x_i − x_j + 2 x_i x_j)`.
 * - `implication`  — row 4: `x_i ≤ x_j` → `P(x_i − x_i x_j)`.
 * - `equal2`       — row 6: `x_i = x_j` → `P(x_i + x_j − 2 x_i x_j)`.
 */
export type PenaltyMethod =
  | 'transform1'
  | 'transform2'
  | 'atLeastOne'
  | 'exactlyOne2'
  | 'implication'
  | 'equal2';

/** A linear constraint `Σ coeffs[j]·x_j  rel  rhs` over the CURRENT variable list. */
export type Constraint = {
  coeffs: number[];
  rel: Relation;
  rhs: number;
  /** Which penalty recipe the paper applies to this row. */
  method: PenaltyMethod;
  /** Human label used in the formulation trace, e.g. `node 1: exactly one colour`. */
  label?: string;
  /**
   * For an inequality closed by a slack variable: the upper bound the PAPER
   * chose for the slack activity. The paper picks these by inspection ("...
   * estimating a reasonable value for how large the slack activity could be",
   * p.25), so they are data, not something we may silently derive.
   */
  slackBound?: number;
};

/** One literal of a clause: variable index plus polarity. */
export type Literal = { v: number; negated: boolean };

/**
 * A disjunction of literals, `(l₁ ∨ l₂ ∨ …)`. §4.3's clauses have two; longer
 * ones make the penalty a polynomial of higher degree, which `derive()` brings
 * back to quadratic with Rosenberg's reduction (§7 point 4).
 */
export type Clause = Literal[];

/** Per-variable metadata — drives axis labels and the domain views. */
export type VarMeta = {
  /** Display name, e.g. `x₁` or `x₁₁`. */
  name: string;
  /**
   * `slack` closes an inequality (§5); `aux` stands for a product of two
   * variables, introduced by the higher-order reduction (§7 point 4).
   */
  kind: 'decision' | 'slack' | 'aux';
  /** Original double-subscript label before the paper's renumbering, if any. */
  origin?: string;
  /** Domain coordinates, consumed by the domain views. */
  node?: number;
  color?: number;
  facility?: number;
  location?: number;
  /** For a slack bit: which constraint it belongs to, and its power-of-two weight. */
  slackOf?: number;
  weight?: number;
  /** For an aux variable: the two variable indices whose product it replaces. */
  auxOf?: [number, number];
};

/** An undirected graph, shared by Max-Cut / MVC / Graph Colouring. */
export type Graph = {
  nodes: number[];
  edges: [number, number][];
  /** Optional vertex weights (weighted vertex cover, §4.1 Remark). */
  weights?: number[];
};

/**
 * The original, human-readable model — exactly as the paper states it before
 * any QUBO recasting.
 */
export type ConstrainedModel = {
  sense: Sense;
  /** Number of ORIGINAL decision variables (before slack bits are appended). */
  numVars: number;
  varMeta: VarMeta[];
  /** Linear objective coefficients, length `numVars`. */
  linear: number[];
  /**
   * Quadratic objective terms `coef · x_i x_j` with `i < j`, stated ONCE
   * (the builder performs the symmetric split).
   */
  quadratic: { i: number; j: number; coef: number }[];
  constraints: Constraint[];
  /**
   * Satisfiability models: the objective is the number of UNSATISFIED clauses,
   * each counted with weight 1 whatever the penalty scalar.
   */
  clauses?: Clause[];
  /** Max-Cut only: the objective is generated from the edge list. */
  cutEdges?: [number, number][];
};

/** Where a number in Q came from — powers the heatmap's provenance tooltip. */
export type Contribution = {
  /** `objective` | `constraint:<k>` | `clause:<k>` | `edge:<k>` */
  source: string;
  /** Human-readable explanation, already localised at render time. */
  detail: string;
  amount: number;
};

/** The derived QUBO instance. */
export type QuboModel = {
  /** Total variable count including slack bits. */
  n: number;
  varMeta: VarMeta[];
  sense: Sense;
  /** Symmetric Q. Off-diagonal entries may be halves (see §4.3). */
  Q: number[][];
  /**
   * The additive constant dropped from the QUBO. Recovering the ORIGINAL
   * objective value requires adding it back: `y_original = xᵀQx + constant`.
   */
  constant: number;
  /** Provenance per cell, keyed `"i,j"`. */
  provenance: Map<string, Contribution[]>;
  /** Penalty scalar actually used. */
  P: number;
};

/** Result of solving a QUBO. */
export type SampleSet = {
  /** Best assignments found, ascending in objective for `min`, descending for `max`. */
  best: { x: number[]; energy: number }[];
  /** How many distinct assignments attain the best value (degeneracy). */
  degeneracy: number;
  /** `exact` means every assignment was enumerated; `heuristic` means best-found only. */
  quality: 'exact' | 'heuristic';
  /** Energy histogram for the landscape view. */
  histogram: { min: number; max: number; bins: number[] };
  /** Feasible/infeasible split (only meaningful when the case has constraints). */
  feasibleCount?: number;
  evaluated: number;
  elapsedMs: number;
};

/** Which pedagogical group a case belongs to (mirrors the paper's own arc). */
export type CaseGroup = 'natural' | 'knownPenalty' | 'general';

/** Fields every catalogued case carries, whatever its relationship to the paper. */
type CaseCommon = {
  id: string;
  /**
   * e.g. `§5.2` — shown in the source badge. For a worked example this is where
   * the paper works it; for a mentioned one, where the paper names it.
   */
  section: string;
  /** Inclusive page range in the PDF, e.g. `[21, 24]`. */
  pages: [number, number];
  group: CaseGroup;
  /**
   * The reference penalty plus the slider range we expose. For a worked example
   * `paperValue` is the paper's choice; for a mentioned case the paper made no
   * choice, so it is ours and the case file must say why.
   */
  penalty: { paperValue: number; min: number; max: number; step: number } | null;
  model: ConstrainedModel;
  /** Optional graph payload for the domain view / custom editor. */
  graph?: Graph;
  /** Whether the first release ships a custom-input editor for this case. */
  editable: boolean;
  /**
   * Set once a reader edits the input data. The case then describes a different
   * problem, so nothing may claim agreement with any reference — see `applyEdit`
   * in `cases/mutate.ts`.
   */
  custom?: boolean;
};

/**
 * A case the paper works numerically: it prints Q, the constant and the answer.
 *
 * The name predates `ExtendedCase` and is kept because consumers iterate
 * `ALL_CASES` and read `paperQ` straight off each element.
 */
export type QuboCase = CaseCommon & {
  source: 'worked';
  /** The Q matrix as printed in the paper — used ONLY for the reconciliation diff. */
  paperQ: number[][];
  /** The additive constant the paper states (0 when it drops out). */
  paperConstant: number;
  /**
   * The solution the paper reports.
   *
   * Both values are recorded because the paper consistently quotes them as a
   * pair — e.g. §5.4: "Solving QUBO gives y = −982 … we get the original
   * objective function value of 1200 − 982 = 218". The invariant
   * `yOriginal = yQubo + constant` therefore holds for every case and is
   * asserted by the reconciliation harness.
   */
  paperSolution: { x: number[]; yQubo: number; yOriginal: number };
};

/**
 * A problem the paper names but never works: no instance, no Q, no answer.
 *
 * The instance is ours, so there is nothing published to diff against and the
 * case must not pretend otherwise — it deliberately has no `paperQ`. What
 * replaces it is a reference that does not run through `derive()` at all:
 * exhaustive search over the ORIGINAL constrained model (`solveConstrained`),
 * which the QUBO optimum has to reproduce. Inventing a `paperQ` from our own
 * output instead would make the check compare `derive()` with itself.
 */
export type ExtendedCase = CaseCommon & {
  source: 'mentioned';
  /**
   * How the paper mentions the problem. `listed` (the default): it is in the
   * §1 list of problems QUBO encompasses. `cited`: it only appears in §6, as
   * the subject of someone else's work the paper cites — a weaker claim, and
   * the page should say which it is.
   */
  mention?: 'listed' | 'cited';
  /**
   * An optimum the paper implies without printing it, when one exists — e.g. a
   * value that follows by a theorem from one of the worked examples. Asserted
   * against the constrained search, so it ties the instance back to a number
   * the paper does print.
   */
  anchor?: {
    yOriginal: number;
    /** How the value follows, in English — quoted by the harness and the emitted code. */
    via: string;
  };
};

/** Anything in the catalogue: a worked example or a mentioned extension. */
export type CatalogCase = QuboCase | ExtendedCase;

/** Guard rails for browser-side solving (see the scale meter). */
export const EXACT_LIMIT = 24;
export const EXACT_COMFORT = 20;
export const HARD_LIMIT = 26;
export const HISTOGRAM_BINS = 64;
