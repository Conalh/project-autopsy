import type { AutopsyReport } from "@project-autopsy/core";

export interface TimelineItem {
  key: string;
  date: string;
  title: string;
  detail: string;
}

export interface DependencySummary {
  manifestCount: number;
  managerLabels: string;
  dependencyCount: number;
  devDependencyCount: number;
  scriptCount: number;
  driftFindingCount: number;
}

export function buildTimelineItems(report: AutopsyReport): TimelineItem[] {
  return report.snapshot.commits.slice(0, 5).map((commit) => ({
    key: commit.sha,
    date: formatDate(commit.committedAt),
    title: commit.message || "Commit without a message",
    detail: `${commit.authorName || "Unknown author"} - ${commit.sha.slice(0, 7)}`
  }));
}

export function buildDependencySummary(report: AutopsyReport): DependencySummary {
  const managers = new Set<string>();
  let dependencyCount = 0;
  let devDependencyCount = 0;
  let scriptCount = 0;

  for (const manifest of report.snapshot.manifests) {
    managers.add(manifest.manager);
    dependencyCount += Object.keys(manifest.dependencies).length;
    devDependencyCount += Object.keys(manifest.devDependencies).length;
    scriptCount += Object.keys(manifest.scripts).length;
  }

  return {
    manifestCount: report.snapshot.manifests.length,
    managerLabels: managers.size > 0 ? [...managers].sort().join(", ") : "none",
    dependencyCount,
    devDependencyCount,
    scriptCount,
    driftFindingCount: report.findings.filter((finding) => finding.kind === "dependency-drift").length
  };
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return parsed.toISOString().slice(0, 10);
}
