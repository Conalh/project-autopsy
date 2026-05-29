import type { Finding, RepoSnapshot } from "../types.js";

/**
 * Turns ingestion problems into first-class findings so a report is never
 * silently incomplete: truncated GitHub trees / capped reads become high
 * findings, and manifests that failed to parse become medium findings that
 * keep the raw excerpt as evidence instead of aborting the whole analysis.
 */
export function detectIngestionIntegrity(snapshot: RepoSnapshot): Finding[] {
  const findings: Finding[] = [];

  for (const warning of snapshot.ingestionWarnings ?? []) {
    findings.push({
      kind: "ingestion-integrity",
      severity: "high",
      title: "Repository inspection may be incomplete",
      body: warning,
      evidence: [
        {
          kind: "file",
          path: snapshot.url ?? snapshot.rootPath,
          excerpt: warning
        }
      ]
    });
  }

  for (const manifest of snapshot.manifests) {
    if (!manifest.parseError) {
      continue;
    }

    const raw = typeof manifest.parsed.raw === "string" ? manifest.parsed.raw : "";
    findings.push({
      kind: "manifest-parse",
      severity: "medium",
      title: `Manifest could not be parsed: ${manifest.path}`,
      body: `The ${manifest.manager} manifest at ${manifest.path} failed to parse (${manifest.parseError}), so its dependencies and scripts were skipped. Fix the manifest to restore dependency and validation checks.`,
      evidence: [
        {
          kind: "manifest",
          path: manifest.path,
          excerpt: raw ? raw.slice(0, 200) : manifest.parseError
        }
      ]
    });
  }

  return findings;
}
