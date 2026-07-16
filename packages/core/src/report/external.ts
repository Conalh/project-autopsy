import type {
  AutopsyReport,
  CommitSummary,
  DocRecord,
  IngestionCompleteness,
  ManifestRecord,
  RepoSnapshot
} from "../types.js";

/**
 * Keep the externally returned/saved report useful while stripping raw analysis
 * inputs that can expose private repository contents.
 */
export function createExternalAutopsyReport(report: AutopsyReport): AutopsyReport {
  return {
    ...report,
    snapshot: {
      ...report.snapshot,
      files: [],
      docs: report.snapshot.docs.map(toExternalDoc),
      manifests: report.snapshot.manifests.map(toExternalManifest),
      commits: report.snapshot.commits.map(toExternalCommit),
      completeness: report.snapshot.completeness ?? legacyCompleteness(report.snapshot)
    }
  };
}

function toExternalDoc(doc: DocRecord): DocRecord {
  return {
    path: doc.path,
    ...(doc.title ? { title: doc.title } : {}),
    content: ""
  };
}

function toExternalManifest(manifest: ManifestRecord): ManifestRecord {
  return {
    ...manifest,
    parsed: {}
  };
}

function toExternalCommit(commit: CommitSummary): CommitSummary {
  return {
    sha: commit.sha,
    committedAt: commit.committedAt,
    authorName: "",
    message: ""
  };
}

function legacyCompleteness(snapshot: RepoSnapshot): IngestionCompleteness {
  const reason = ["legacy-completeness-unavailable"];
  return {
    files: {
      status: "partial",
      discovered: snapshot.fileCount,
      included: snapshot.fileCount,
      skipped: 0,
      reasons: reason
    },
    manifests: {
      status: "partial",
      discovered: snapshot.manifests.length,
      read: snapshot.manifests.length,
      skipped: 0,
      oversized: 0,
      failed: 0,
      reasons: reason
    },
    docs: {
      status: "partial",
      discovered: snapshot.docs.length,
      read: snapshot.docs.length,
      skipped: 0,
      oversized: 0,
      failed: 0,
      reasons: reason
    },
    commits: {
      status: "partial",
      requested: snapshot.commits.length,
      read: snapshot.commits.length,
      skipped: 0,
      reasons: reason
    },
    runtime: {
      status: "partial",
      elapsedMs: 0,
      limitMs: 0,
      timedOut: false,
      reasons: reason
    }
  };
}
