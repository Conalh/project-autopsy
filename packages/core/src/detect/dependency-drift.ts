import type {
  Finding,
  InspectionBudgetOverrides,
  ManifestRecord,
  RepoSnapshot
} from "../types.js";
import {
  createInspectionBudgetContext,
  getRemainingRuntimeMs,
  isRuntimeExpired,
  type InspectionBudgetContext
} from "../ingest/budgets.js";
import { fetchWithTimeout, mapWithConcurrency } from "../util/async.js";

export interface DependencyDriftOptions {
  checkDependencyRegistry?: boolean;
  npmRegistryFetch?: typeof fetch;
  pypiRegistryFetch?: typeof fetch;
  cratesRegistryFetch?: typeof fetch;
  budgets?: InspectionBudgetOverrides;
  budgetContext?: InspectionBudgetContext;
}

interface NpmRegistryResponse {
  "dist-tags"?: {
    latest?: string;
  };
}

interface PypiRegistryResponse {
  info?: {
    version?: string;
  };
}

interface CratesRegistryResponse {
  crate?: {
    max_version?: string;
    newest_version?: string;
  };
}

type DriftEcosystem = "npm" | "Python" | "Rust";

interface EcosystemConfig {
  label: DriftEcosystem;
  fetchOption: keyof Pick<
    DependencyDriftOptions,
    "npmRegistryFetch" | "pypiRegistryFetch" | "cratesRegistryFetch"
  >;
  fetchLatest: (name: string, registryFetch: typeof fetch, timeoutMs: number) => Promise<string>;
}

const REGISTRY_TIMEOUT_MS = 10000;

interface DependencyEntry {
  manifest: ManifestRecord;
  ecosystem: EcosystemConfig;
  registryFetch: typeof fetch;
  name: string;
  version: string;
  kind: "dependency" | "dev dependency";
}

interface DependencyLookupResult {
  entry: DependencyEntry;
  latestVersion?: string;
  error?: string;
}

const ECOSYSTEMS: Partial<Record<ManifestRecord["manager"], EcosystemConfig>> = {
  npm: { label: "npm", fetchOption: "npmRegistryFetch", fetchLatest: fetchNpmLatestVersion },
  python: { label: "Python", fetchOption: "pypiRegistryFetch", fetchLatest: fetchPypiLatestVersion },
  rust: { label: "Rust", fetchOption: "cratesRegistryFetch", fetchLatest: fetchCratesLatestVersion }
};

export async function detectDependencyDrift(
  snapshot: RepoSnapshot,
  options: DependencyDriftOptions = {}
): Promise<Finding[]> {
  if (!options.checkDependencyRegistry) {
    return [];
  }

  // Cache latest-version lookups (and their in-flight promises) across every
  // manifest so a package shared by multiple workspaces is fetched once.
  const budgetContext = options.budgetContext ?? createInspectionBudgetContext(options.budgets);
  const { budgets } = budgetContext;
  const cache = new Map<string, Promise<string>>();
  const entries = snapshot.manifests.flatMap((manifest) => readDependencyEntries(manifest, options));
  const lookups = await mapWithConcurrency(entries, budgets.registryConcurrency, async (entry) => {
    if (isRuntimeExpired(budgetContext)) {
      return {
        entry,
        error: "registry lookup skipped because the inspection runtime budget was exhausted"
      } satisfies DependencyLookupResult;
    }

    try {
      return {
        entry,
        latestVersion: await resolveLatestVersion(
          cache,
          entry.ecosystem,
          entry.name,
          entry.registryFetch,
          Math.min(REGISTRY_TIMEOUT_MS, getRemainingRuntimeMs(budgetContext))
        )
      } satisfies DependencyLookupResult;
    } catch (error) {
      return {
        entry,
        error: error instanceof Error ? error.message : String(error)
      } satisfies DependencyLookupResult;
    }
  });

  const findings: Finding[] = [];
  for (const result of lookups) {
    if (result.error) {
      findings.push(createDependencyLookupFailureFinding(result.entry, result.error));
      continue;
    }

    const finding = createMajorDriftFinding(
      result.entry.manifest,
      result.entry.name,
      result.entry.version,
      result.latestVersion ?? "",
      result.entry.kind,
      result.entry.ecosystem.label
    );
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

function readDependencyEntries(manifest: ManifestRecord, options: DependencyDriftOptions): DependencyEntry[] {
  if (manifest.parseError) {
    return [];
  }

  const ecosystem = ECOSYSTEMS[manifest.manager];
  if (!ecosystem) {
    return [];
  }

  const registryFetch = options[ecosystem.fetchOption] ?? fetch;
  return [
    ...Object.entries(manifest.dependencies).map(([name, version]) => ({
      manifest,
      ecosystem,
      registryFetch,
      name,
      version,
      kind: "dependency" as const
    })),
    ...Object.entries(manifest.devDependencies).map(([name, version]) => ({
      manifest,
      ecosystem,
      registryFetch,
      name,
      version,
      kind: "dev dependency" as const
    }))
  ].filter((entry) => readMajorVersion(entry.version) !== undefined);
}

function resolveLatestVersion(
  cache: Map<string, Promise<string>>,
  ecosystem: EcosystemConfig,
  name: string,
  registryFetch: typeof fetch,
  timeoutMs: number
): Promise<string> {
  const key = `${ecosystem.label}:${name}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const pending = ecosystem.fetchLatest(name, registryFetch, timeoutMs);
  cache.set(key, pending);
  return pending;
}

async function fetchNpmLatestVersion(name: string, registryFetch: typeof fetch, timeoutMs: number): Promise<string> {
  const body = await fetchRegistryJson<NpmRegistryResponse>(
    registryFetch,
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    "npm registry",
    name,
    timeoutMs
  );
  const latest = body["dist-tags"]?.latest;
  if (!latest) {
    throw new Error(`npm registry response did not include dist-tags.latest for ${name}`);
  }

  return latest;
}

async function fetchPypiLatestVersion(name: string, registryFetch: typeof fetch, timeoutMs: number): Promise<string> {
  const body = await fetchRegistryJson<PypiRegistryResponse>(
    registryFetch,
    `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
    "PyPI",
    name,
    timeoutMs
  );
  const latest = body.info?.version;
  if (!latest) {
    throw new Error(`PyPI response did not include info.version for ${name}`);
  }

  return latest;
}

async function fetchCratesLatestVersion(name: string, registryFetch: typeof fetch, timeoutMs: number): Promise<string> {
  const body = await fetchRegistryJson<CratesRegistryResponse>(
    registryFetch,
    `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`,
    "crates.io",
    name,
    timeoutMs
  );
  const latest = body.crate?.max_version ?? body.crate?.newest_version;
  if (!latest) {
    throw new Error(`crates.io response did not include crate.max_version for ${name}`);
  }

  return latest;
}

async function fetchRegistryJson<T>(
  registryFetch: typeof fetch,
  url: string,
  registryName: string,
  packageName: string,
  timeoutMs: number
): Promise<T> {
  const response = await fetchWithTimeout(
    registryFetch,
    url,
    {
      headers: {
        accept: "application/json",
        "user-agent": "project-autopsy"
      }
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`${registryName} returned ${response.status} for ${packageName}`);
  }

  return (await response.json()) as T;
}

function createDependencyLookupFailureFinding(entry: DependencyEntry, error: string): Finding {
  return {
    kind: "dependency-drift",
    severity: "info",
    title: `${entry.ecosystem.label} dependency freshness was not checked: ${entry.name}`,
    body: `Registry lookup failed for ${entry.name}: ${error}`,
    evidence: [
      {
        kind: "manifest",
        path: entry.manifest.path,
        excerpt: `${entry.name} registry lookup was requested but did not complete`
      }
    ]
  };
}

function createMajorDriftFinding(
  manifest: ManifestRecord,
  name: string,
  declaredVersion: string,
  latestVersion: string,
  dependencyKind: "dependency" | "dev dependency",
  ecosystem: DriftEcosystem = "npm"
): Finding | undefined {
  const declaredMajor = readMajorVersion(declaredVersion);
  const latestMajor = readMajorVersion(latestVersion);
  if (declaredMajor === undefined || latestMajor === undefined || declaredMajor >= latestMajor) {
    return undefined;
  }

  return {
    kind: "dependency-drift",
    severity: "medium",
    title: `${ecosystem} ${dependencyKind} is behind the latest major: ${name}`,
    body: `${name} is declared as ${declaredVersion}, while the ${formatRegistryName(ecosystem)} reports ${latestVersion} as latest.`,
    evidence: [
      {
        kind: "manifest",
        path: manifest.path,
        excerpt: `${name} declared ${declaredVersion}, latest ${latestVersion}`
      }
    ]
  };
}

/**
 * Extract a comparable major version, returning undefined for ranges we cannot
 * meaningfully compare against a registry latest: workspace protocols, git/url
 * dependencies, npm aliases, wildcards, and other non-semver specifiers.
 */
function readMajorVersion(versionRange: string): number | undefined {
  const trimmed = versionRange.trim();
  if (!trimmed || isUncomparableRange(trimmed)) {
    return undefined;
  }

  const match = trimmed.match(/\d+/);
  return match?.[0] ? Number(match[0]) : undefined;
}

function isUncomparableRange(range: string): boolean {
  if (/^(workspace|file|link|git|git\+|github|gitlab|bitbucket|npm|http|https|portal|catalog):/i.test(range)) {
    return true;
  }
  if (/^(\*|x|latest|next|\^?0\.0\.0)$/i.test(range)) {
    return true;
  }
  if (range.includes("://")) {
    return true;
  }
  // Bare `owner/repo` git shorthand with no leading version number.
  if (/^[\w.-]+\/[\w.-]+/.test(range) && !/^[\D]*\d/.test(range.split("/")[0] ?? "")) {
    return true;
  }
  return false;
}

function formatManagerName(manager: ManifestRecord["manager"]): string {
  if (manager === "python") {
    return "Python";
  }

  if (manager === "rust") {
    return "Rust";
  }

  return manager;
}

function formatRegistryName(ecosystem: DriftEcosystem): string {
  if (ecosystem === "Python") {
    return "PyPI";
  }

  if (ecosystem === "Rust") {
    return "crates.io";
  }

  return "npm registry";
}
