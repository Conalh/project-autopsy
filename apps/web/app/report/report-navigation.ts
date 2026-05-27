import type { AutopsyReport } from "@project-autopsy/core";
import { buildTimelineItems } from "./report-summary";

export interface ReportNavigationItem {
  href: string;
  label: string;
}

export function buildReportNavigation(report: AutopsyReport): ReportNavigationItem[] {
  return [
    { href: "#verdict", label: "Verdict" },
    { href: "#timeline", label: `Timeline ${buildTimelineItems(report).length}` },
    { href: "#findings", label: `Findings ${report.findings.length}` },
    { href: "#revival-plan", label: `Revival Plan ${report.revivalTasks.length}` },
    { href: "#dependencies", label: `Dependencies ${report.snapshot.manifests.length}` },
    { href: "#evidence", label: `Evidence ${Object.keys(report.evidenceIndex).length}` }
  ];
}
