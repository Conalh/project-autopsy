import type { Finding, ManifestRecord, RepoSnapshot } from "../types.js";

export interface DependencyDriftOptions {
  checkDependencyRegistry?: boolean;
  npmRegistryFetch?: typeof fetch;
  pypiRegistryFetch?: typeof fetch;
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

export async function detectDependencyDrift(
  snapshot: RepoSnapshot,
  options: DependencyDriftOptions = {}
): Promise<Finding[]> {
  if (!options.checkDependencyRegistry) {
    return [];
  }

  const registryJobs = snapshot.manifests
    .filter((manifest) => manifest.manager === "npm" || manifest.manager === "python")
    .map((manifest) => detectManifestDependencyDrift(manifest, options));

  return (await Promise.all(registryJobs)).flat();
}

async function detectManifestDependencyDrift(
  manifest: ManifestRecord,
  options: DependencyDriftOptions
): Promise<Finding[]> {
  try {
    if (manifest.manager === "npm") {
      return await detectNpmDependencyDrift(manifest, options.npmRegistryFetch ?? fetch);
    }

    if (manifest.manager === "python") {
      return await detectPythonDependencyDrift(manifest, options.pypiRegistryFetch ?? fetch);
    }

    return [];
  } catch (error) {
    return [
      {
        kind: "dependency-drift",
        severity: "info",
        title: `${formatManagerName(manifest.manager)} dependency freshness was not checked`,
        body: `Registry lookup failed: ${error instanceof Error ? error.message : String(error)}`,
        evidence: [
          {
            kind: "manifest",
            path: manifest.path,
            excerpt: `${formatManagerName(manifest.manager)} registry lookup was requested but did not complete`
          }
        ]
      }
    ];
  }
}

async function detectNpmDependencyDrift(
  manifest: ManifestRecord,
  registryFetch: typeof fetch
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const [name, declaredVersion] of Object.entries(manifest.dependencies)) {
    const latestVersion = await fetchNpmLatestVersion(name, registryFetch);
    const finding = createMajorDriftFinding(manifest, name, declaredVersion, latestVersion, "dependency");
    if (finding) {
      findings.push(finding);
    }
  }

  for (const [name, declaredVersion] of Object.entries(manifest.devDependencies)) {
    const latestVersion = await fetchNpmLatestVersion(name, registryFetch);
    const finding = createMajorDriftFinding(manifest, name, declaredVersion, latestVersion, "dev dependency");
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

async function detectPythonDependencyDrift(
  manifest: ManifestRecord,
  registryFetch: typeof fetch
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const [name, declaredVersion] of Object.entries(manifest.dependencies)) {
    const latestVersion = await fetchPypiLatestVersion(name, registryFetch);
    const finding = createMajorDriftFinding(
      manifest,
      name,
      declaredVersion,
      latestVersion,
      "dependency",
      "Python"
    );
    if (finding) {
      findings.push(finding);
    }
  }

  for (const [name, declaredVersion] of Object.entries(manifest.devDependencies)) {
    const latestVersion = await fetchPypiLatestVersion(name, registryFetch);
    const finding = createMajorDriftFinding(
      manifest,
      name,
      declaredVersion,
      latestVersion,
      "dev dependency",
      "Python"
    );
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

async function fetchNpmLatestVersion(name: string, registryFetch: typeof fetch): Promise<string> {
  const response = await registryFetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: {
      accept: "application/json",
      "user-agent": "project-autopsy"
    }
  });

  if (!response.ok) {
    throw new Error(`npm registry returned ${response.status} for ${name}`);
  }

  const body = (await response.json()) as NpmRegistryResponse;
  const latest = body["dist-tags"]?.latest;
  if (!latest) {
    throw new Error(`npm registry response did not include dist-tags.latest for ${name}`);
  }

  return latest;
}

async function fetchPypiLatestVersion(name: string, registryFetch: typeof fetch): Promise<string> {
  const response = await registryFetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
    headers: {
      accept: "application/json",
      "user-agent": "project-autopsy"
    }
  });

  if (!response.ok) {
    throw new Error(`PyPI returned ${response.status} for ${name}`);
  }

  const body = (await response.json()) as PypiRegistryResponse;
  const latest = body.info?.version;
  if (!latest) {
    throw new Error(`PyPI response did not include info.version for ${name}`);
  }

  return latest;
}

function createMajorDriftFinding(
  manifest: ManifestRecord,
  name: string,
  declaredVersion: string,
  latestVersion: string,
  dependencyKind: "dependency" | "dev dependency",
  ecosystem: "npm" | "Python" = "npm"
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

function readMajorVersion(versionRange: string): number | undefined {
  const match = versionRange.match(/\d+/);
  return match?.[0] ? Number(match[0]) : undefined;
}

function formatManagerName(manager: ManifestRecord["manager"]): string {
  return manager === "python" ? "Python" : manager;
}

function formatRegistryName(ecosystem: "npm" | "Python"): string {
  return ecosystem === "Python" ? "PyPI" : "npm registry";
}
