import type { RepoSnapshot } from "../types.js";

export function hasPartialFileInventory(snapshot: RepoSnapshot): boolean {
  return snapshot.completeness?.files.status === "partial";
}

export function hasPartialManifestInventory(snapshot: RepoSnapshot): boolean {
  return snapshot.completeness?.manifests.status === "partial";
}

export function hasPartialDocs(snapshot: RepoSnapshot): boolean {
  return snapshot.completeness?.docs.status === "partial";
}

export function hasPartialCommits(snapshot: RepoSnapshot): boolean {
  return snapshot.completeness?.commits.status === "partial";
}

export function formatCompletenessReasons(snapshot: RepoSnapshot): string {
  const reasons = [
    ...(snapshot.completeness?.files.reasons ?? []),
    ...(snapshot.completeness?.manifests.reasons ?? []),
    ...(snapshot.completeness?.docs.reasons ?? []),
    ...(snapshot.completeness?.commits.reasons ?? [])
  ];

  return [...new Set(reasons)].sort().join(", ") || "bounded input";
}
