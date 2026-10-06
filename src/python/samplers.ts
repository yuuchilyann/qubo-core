/**
 * The sampler catalogue.
 *
 * The split that matters pedagogically is `needsToken`. Every one of the
 * paper's eleven cases is small enough for `dimod.ExactSolver`, which runs
 * locally with no account, no API key and no QPU charge — so the exported code
 * is something a reader can actually paste into Colab and run, not an
 * aspirational snippet. Only `qpu` and `hybrid` reach D-Wave hardware, and only
 * `amplify-da4` reaches Fujitsu's.
 *
 * The entries in between are the interesting ones for a reader who has no Leap
 * account. `sa` and `tabu` are D-Wave's own production solvers running
 * classically; `mock` additionally performs a real minor-embedding onto a real
 * topology. Each supports a claim that is true as written, and none of them
 * supports "solved on a quantum annealer".
 */

export type SamplerId = 'exact' | 'tabu' | 'sa' | 'mock' | 'da' | 'qpu' | 'hybrid' | 'amplify-da4';

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
  | 'sampler.limit.mock'
  | 'sampler.limit.da'
  | 'sampler.limit.qpu'
  | 'sampler.limit.hybrid'
  | 'sampler.limit.amplifyDa4';

export type SamplerSpec = {
  id: SamplerId;
  label: string;
  /** `false` ⇒ runs entirely on the reader's own machine. */
  needsToken: boolean;
  /**
   * What the program is built on. `dimod` programs hand a BQM to a sampler
   * object; `standalone` carries its own solver and needs no package; `amplify`
   * builds a Fixstars Amplify model and calls a Fujitsu client.
   */
  family: 'dimod' | 'standalone' | 'amplify';
  /** pip/uv package names required. */
  packages: string[];
  /** Import lines for this sampler. */
  imports: string[];
  /** Expression constructing the sampler object. */
  construct: string;
  /** Extra keyword arguments passed to `.sample()`. */
  sampleArgs: string;
  /** Practical ceiling, shown in the UI. Localised, hence a key. */
  limitKey: SamplerLimitKey;
  /** Credential setup shell step, when it is not D-Wave's. */
  tokenSetup?: string;
};

export const SAMPLERS: SamplerSpec[] = [
  {
    id: 'exact',
    family: 'dimod',
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
    family: 'dimod',
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
    family: 'dimod',
    label: 'SimulatedAnnealingSampler',
    needsToken: false,
    packages: ['dimod', 'dwave-samplers'],
    imports: ['import dimod', 'from dwave.samplers import SimulatedAnnealingSampler'],
    construct: 'SimulatedAnnealingSampler()',
    sampleArgs: 'num_reads=100',
    limitKey: 'sampler.limit.sa',
  },
  {
    /**
     * The whole path to hardware, minus the hardware.
     *
     * `MockDWaveSampler` presents a real solver topology, so
     * `EmbeddingComposite` performs an actual minor-embedding onto it and the
     * chains are real chains. What is simulated is only the annealing itself.
     *
     * That makes this the honest choice for anyone without a Leap account: the
     * claim it supports is "the embedding path is implemented and executed",
     * which is true, rather than "solved on a quantum annealer", which is not.
     * Swapping it for `qpu` below is a change of credentials, not of code.
     */
    id: 'mock',
    family: 'dimod',
    label: 'MockDWaveSampler + EmbeddingComposite',
    needsToken: false,
    packages: ['dimod', 'dwave-system'],
    imports: [
      'import dimod',
      'from dwave.system import EmbeddingComposite',
      'from dwave.system.testing import MockDWaveSampler',
    ],
    construct: 'EmbeddingComposite(MockDWaveSampler())',
    sampleArgs: 'num_reads=100',
    limitKey: 'sampler.limit.mock',
  },
  {
    /**
     * Fujitsu's Digital Annealer ALGORITHM (Aramon et al. 2019), as a plain
     * Python function inside the program. No package, no account: the claim it
     * supports is "this is how the DA's method searches", never "solved on a
     * Digital Annealer". `verify:emit` runs it for real rather than stubbing it.
     */
    id: 'da',
    family: 'standalone',
    label: 'Digital Annealer algorithm (pure Python)',
    needsToken: false,
    packages: [],
    imports: ['import math', 'import random'],
    construct: '',
    sampleArgs: 'runs=16, sweeps=200, seed=1',
    limitKey: 'sampler.limit.da',
  },
  {
    id: 'qpu',
    family: 'dimod',
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
    family: 'dimod',
    label: 'LeapHybridSampler',
    needsToken: true,
    packages: ['dwave-ocean-sdk'],
    imports: ['import dimod', 'from dwave.system import LeapHybridSampler'],
    construct: 'LeapHybridSampler()',
    sampleArgs: '',
    limitKey: 'sampler.limit.hybrid',
  },
  {
    /**
     * Fujitsu's Digital Annealer (fourth generation) through Fixstars Amplify,
     * whose `FujitsuDA4Client` is publicly documented. Fujitsu's own request
     * format is not public, so this is the route that can be written down.
     * Running it needs a Fujitsu token; `verify:emit` exercises the program
     * against a stub of Amplify, which checks the program and NOT the service.
     */
    id: 'amplify-da4',
    family: 'amplify',
    label: 'Fujitsu DA4 via Amplify (FujitsuDA4Client)',
    needsToken: true,
    packages: ['amplify'],
    imports: [
      'import os',
      'from datetime import timedelta',
      'from amplify import FujitsuDA4Client, Model, VariableGenerator, solve',
    ],
    construct: 'FujitsuDA4Client()',
    sampleArgs: '',
    limitKey: 'sampler.limit.amplifyDa4',
    tokenSetup: 'export FUJITSU_DA_TOKEN="your token"   # PowerShell: $env:FUJITSU_DA_TOKEN = "your token"',
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
  const unique = [...new Set(packages)];
  if (!unique.length) return '';
  const pkgs = unique.join(' ');
  // conda-forge's meta-package only covers Ocean; anything else goes through
  // pip, which works inside a conda environment too.
  const ocean = unique.some((p) => p === 'dimod' || p.startsWith('dwave'));
  switch (env) {
    case 'pip':
      return `pip install ${pkgs}`;
    case 'uv':
      return `uv pip install ${pkgs}`;
    case 'conda':
      return ocean ? `conda install -c conda-forge dwave-ocean-sdk` : `pip install ${pkgs}`;
  }
}

/** Packages needed for a case: the sampler's own, plus anything the view uses. */
export function packagesFor(spec: SamplerSpec, extras: string[] = []): string[] {
  return [...spec.packages, ...extras];
}

/** Configuring credentials is a shell step, and only applies to the samplers that need a token. */
export const TOKEN_SETUP = `dwave config create   # or set the DWAVE_API_TOKEN environment variable`;

/** The credential step for a given sampler. */
export function tokenSetupFor(spec: SamplerSpec): string {
  return spec.tokenSetup ?? TOKEN_SETUP;
}
