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
