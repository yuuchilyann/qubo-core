/**
 * The sampler catalogue.
 *
 * The split that matters pedagogically is `needsToken`. Every one of the
 * paper's eleven cases is small enough for `dimod.ExactSolver`, which runs
 * locally with no account, no API key and no QPU charge — so the exported code
 * is something a reader can actually paste into Colab and run, not an
 * aspirational snippet. Only the last two entries reach D-Wave hardware.
 */

export type SamplerId = 'exact' | 'tabu' | 'sa' | 'qpu' | 'hybrid';

/**
 * Dictionary keys for each sampler's practical ceiling.
 *
 * The core owns this union rather than importing a `TKey` from a consumer's
 * i18n dictionary: the dependency has to point this way round, or every
 * consumer would need the same dictionary. Consumers assert that their own
 * `TKey` covers this union, which preserves the compile-time guarantee that a
 * key cannot be misspelled or removed.
 */
export type SamplerLimitKey =
  | 'sampler.limit.exact'
  | 'sampler.limit.tabu'
  | 'sampler.limit.sa'
  | 'sampler.limit.qpu'
  | 'sampler.limit.hybrid';

export type SamplerSpec = {
  id: SamplerId;
  label: string;
  /** `false` ⇒ runs entirely on the reader's own machine. */
  needsToken: boolean;
  /** pip/uv package names required on top of `dimod`. */
  packages: string[];
  /** Import lines for this sampler. */
  imports: string[];
  /** Expression constructing the sampler object. */
  construct: string;
  /** Extra keyword arguments passed to `.sample()`. */
  sampleArgs: string;
  /** Practical ceiling, shown in the UI. Localised, hence a key. */
  limitKey: SamplerLimitKey;
};

export const SAMPLERS: SamplerSpec[] = [
  {
    id: 'exact',
    label: 'dimod.ExactSolver',
    needsToken: false,
    packages: ['dimod'],
    imports: ['import dimod'],
    construct: 'dimod.ExactSolver()',
    sampleArgs: '',
    limitKey: 'sampler.limit.exact',
  },
  {
    id: 'tabu',
    label: 'TabuSampler',
    needsToken: false,
    packages: ['dimod', 'dwave-samplers'],
    imports: ['import dimod', 'from dwave.samplers import TabuSampler'],
    construct: 'TabuSampler()',
    sampleArgs: 'num_reads=100',
    limitKey: 'sampler.limit.tabu',
  },
  {
    id: 'sa',
    label: 'SimulatedAnnealingSampler',
    needsToken: false,
    packages: ['dimod', 'dwave-samplers'],
    imports: ['import dimod', 'from dwave.samplers import SimulatedAnnealingSampler'],
    construct: 'SimulatedAnnealingSampler()',
    sampleArgs: 'num_reads=100',
    limitKey: 'sampler.limit.sa',
  },
  {
    id: 'qpu',
    label: 'DWaveSampler + EmbeddingComposite',
    needsToken: true,
    packages: ['dwave-ocean-sdk'],
    imports: [
      'import dimod',
      'from dwave.system import DWaveSampler, EmbeddingComposite',
    ],
    construct: 'EmbeddingComposite(DWaveSampler())',
    sampleArgs: 'num_reads=1000',
    limitKey: 'sampler.limit.qpu',
  },
  {
    id: 'hybrid',
    label: 'LeapHybridSampler',
    needsToken: true,
    packages: ['dwave-ocean-sdk'],
    imports: ['import dimod', 'from dwave.system import LeapHybridSampler'],
    construct: 'LeapHybridSampler()',
    sampleArgs: '',
    limitKey: 'sampler.limit.hybrid',
  },
];

export function findSampler(id: SamplerId): SamplerSpec {
  const s = SAMPLERS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown sampler: ${id}`);
  return s;
}

export type EnvKey = 'pip' | 'conda' | 'uv';

/**
 * Install commands.
 *
 * Package names are spelled out rather than using `dwave-ocean-sdk[all]`-style
 * extras: square brackets are glob characters in zsh and PowerShell and would
 * need per-shell quoting, whereas explicit names work identically in cmd,
 * PowerShell, bash and zsh.
 *
 * conda uses the `dwave-ocean-sdk` meta-package because that is what
 * conda-forge actually publishes a feedstock for; the finer-grained
 * `dwave-samplers` is not reliably available there.
 */
export function installCommand(env: EnvKey, packages: string[]): string {
  const pkgs = [...new Set(packages)].join(' ');
  switch (env) {
    case 'pip':
      return `pip install ${pkgs}`;
    case 'uv':
      return `uv pip install ${pkgs}`;
    case 'conda':
      return `conda install -c conda-forge dwave-ocean-sdk`;
  }
}

/** Packages needed for a case: the sampler's own, plus anything the view uses. */
export function packagesFor(spec: SamplerSpec, extras: string[] = []): string[] {
  return [...spec.packages, ...extras];
}

/** Configuring credentials is a shell step, and only applies to the QPU samplers. */
export const TOKEN_SETUP = `dwave config create   # or set the DWAVE_API_TOKEN environment variable`;
