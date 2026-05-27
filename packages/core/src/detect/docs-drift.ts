import path from "node:path";
import type { Finding, RepoSnapshot } from "../types.js";

export function detectDocsDrift(snapshot: RepoSnapshot): Finding[] {
  const findings: Finding[] = [];
  const filePaths = new Set(snapshot.files.map((file) => file.path));

  for (const doc of snapshot.docs.filter(isPublicProjectDoc)) {
    const references = [...doc.content.matchAll(/`([^`]+\.[a-zA-Z0-9]+)`/g)]
      .map((match) => match[1])
      .filter((reference): reference is string => Boolean(reference));

    for (const reference of references) {
      if (shouldIgnoreReference(reference)) {
        continue;
      }

      const normalized = normalizeReference(doc.path, reference, filePaths);
      if (!filePaths.has(normalized)) {
        findings.push({
          kind: "docs-drift",
          severity: "medium",
          title: `Documented file is missing: ${reference}`,
          body: `Documentation references \`${reference}\`, but that file was not found in the repository snapshot.`,
          evidence: [
            {
              kind: "docs",
              path: doc.path,
              excerpt: reference
            }
          ]
        });
      }
    }
  }

  return findings;
}

function isPublicProjectDoc(doc: { path: string }): boolean {
  const normalized = doc.path.toLowerCase();
  return normalized === "readme.md" || (normalized.startsWith("docs/") && !normalized.startsWith("docs/superpowers/"));
}

function shouldIgnoreReference(reference: string): boolean {
  return (
    reference.includes("*") ||
    reference.includes("{") ||
    reference.includes("}") ||
    reference.includes(" ") ||
    reference.startsWith("http://") ||
    reference.startsWith("https://")
  );
}

function normalizeReference(docPath: string, reference: string, filePaths: Set<string>): string {
  const fromRoot = reference.replaceAll("\\", "/").replace(/^\.\//, "");
  if (filePaths.has(fromRoot)) {
    return fromRoot;
  }

  if (fromRoot.includes("/")) {
    return fromRoot;
  }

  const docDirectory = path.posix.dirname(docPath);
  if (docDirectory === ".") {
    return fromRoot;
  }

  return path.posix.normalize(path.posix.join(docDirectory, fromRoot));
}
