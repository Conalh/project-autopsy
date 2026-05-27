import type { AutopsyReport, Severity } from "@project-autopsy/core";

const severityOrder: Severity[] = ["high", "medium", "low", "info"];

const severityLabels: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info"
};

export interface SeverityChartItem {
  severity: Severity;
  label: string;
  count: number;
  percent: number;
}

export interface ReportChartItem {
  key: string;
  label: string;
  count: number;
  percent: number;
  tone: "danger" | "warning" | "accent" | "muted";
}

export function buildSeverityChartItems(report: AutopsyReport): SeverityChartItem[] {
  const counts = report.summary.findingCounts;
  const total = severityOrder.reduce((sum, severity) => sum + counts[severity], 0);

  return severityOrder.map((severity) => ({
    severity,
    label: severityLabels[severity],
    count: counts[severity],
    percent: total > 0 ? Math.round((counts[severity] / total) * 100) : 0
  }));
}

export function buildFindingKindChartItems(report: AutopsyReport): ReportChartItem[] {
  const counts = new Map<string, number>();

  for (const finding of report.findings) {
    counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + 1);
  }

  const total = report.findings.length;

  return [...counts.entries()]
    .sort(([leftKind, leftCount], [rightKind, rightCount]) => rightCount - leftCount || leftKind.localeCompare(rightKind))
    .map(([kind, count]) => ({
      key: kind,
      label: formatKindLabel(kind),
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
      tone: selectFindingKindTone(kind)
    }));
}

export function buildDependencyCompositionChartItems(report: AutopsyReport): ReportChartItem[] {
  let runtimeCount = 0;
  let devCount = 0;
  let scriptCount = 0;

  for (const manifest of report.snapshot.manifests) {
    runtimeCount += Object.keys(manifest.dependencies).length;
    devCount += Object.keys(manifest.devDependencies).length;
    scriptCount += Object.keys(manifest.scripts).length;
  }

  const total = runtimeCount + devCount + scriptCount;

  return [
    createCompositionItem("runtime-deps", "Runtime deps", runtimeCount, total, "accent"),
    createCompositionItem("dev-deps", "Dev deps", devCount, total, "warning"),
    createCompositionItem("scripts", "Scripts", scriptCount, total, "muted")
  ];
}

function createCompositionItem(
  key: string,
  label: string,
  count: number,
  total: number,
  tone: ReportChartItem["tone"]
): ReportChartItem {
  return {
    key,
    label,
    count,
    percent: total > 0 ? Math.round((count / total) * 100) : 0,
    tone
  };
}

function formatKindLabel(kind: string): string {
  return kind
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function selectFindingKindTone(kind: string): ReportChartItem["tone"] {
  if (kind === "setup-risk" || kind === "validation-surface") {
    return "danger";
  }

  if (kind === "docs-drift" || kind === "dependency-drift") {
    return "warning";
  }

  return "accent";
}
