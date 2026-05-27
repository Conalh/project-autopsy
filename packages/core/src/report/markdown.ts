import type { AutopsyReport, Finding, RevivalTask, StallHypothesis } from "../types.js";

export function renderMarkdownReport(report: AutopsyReport): string {
  const lines = [
    `# ${formatReportTitle(report.snapshot.summary.projectName)}`,
    "",
    "## Verdict",
    "",
    `**Score:** ${report.verdict.score}/100`,
    `**Status:** ${report.verdict.status}`,
    "",
    report.verdict.summary,
    "",
    "## Project Snapshot",
    "",
    `- Source: ${report.snapshot.sourceType}`,
    `- Files inspected: ${report.snapshot.fileCount}`,
    `- Latest commit: ${report.snapshot.commits[0]?.message ?? "No commit history found"}`,
    `- Technologies: ${report.snapshot.summary.technologies.join(", ") || "Unknown"}`,
    "",
    ...formatDependencySnapshot(report),
    "## Stall Hypotheses",
    "",
    ...report.stallHypotheses.flatMap(formatHypothesis),
    "## Top Findings",
    "",
    ...report.findings.flatMap(formatFinding),
    "## Revival Plan",
    "",
    ...report.revivalTasks.flatMap(formatTask),
    "## Evidence Index",
    "",
    ...Object.values(report.evidenceIndex).flatMap(formatEvidence)
  ];

  return `${lines.join("\n").trim()}\n`;
}

function formatReportTitle(projectName: string): string {
  return projectName.toLowerCase() === "project autopsy" ? "Project Autopsy" : `Project Autopsy: ${projectName}`;
}

function formatDependencySnapshot(report: AutopsyReport): string[] {
  if (report.snapshot.manifests.length === 0) {
    return [];
  }

  return [
    "## Dependency Snapshot",
    "",
    ...report.snapshot.manifests.flatMap((manifest) => [
      `- **${manifest.path}** (${manifest.manager})`,
      `  Dependencies: ${formatNameValueMap(manifest.dependencies)}`,
      ...(Object.keys(manifest.devDependencies).length > 0
        ? [`  Dev dependencies: ${formatNameValueMap(manifest.devDependencies)}`]
        : []),
      ...(Object.keys(manifest.scripts).length > 0
        ? [`  Scripts: ${formatNameValueMap(manifest.scripts)}`]
        : []),
      ""
    ])
  ];
}

function formatNameValueMap(values: Record<string, string>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([name, value]) => `${name} ${value}`.trim()).join(", ");
}

function formatHypothesis(hypothesis: StallHypothesis): string[] {
  return [
    `${hypothesis.rank}. **${hypothesis.title}** (${hypothesis.confidence} confidence)`,
    `   ${hypothesis.rationale}`,
    ""
  ];
}

function formatFinding(finding: Finding): string[] {
  return [
    `- **${finding.id}: ${finding.title}** (${finding.severity})`,
    `  ${finding.body}`,
    `  Evidence: ${(finding.evidenceIds ?? []).map((id) => `[${id}]`).join(", ")}`,
    ""
  ];
}

function formatTask(task: RevivalTask): string[] {
  return [
    `- **${task.id}: ${task.phase}: ${task.title}**`,
    `  ${task.rationale}`,
    `  Files: ${task.files.join(", ") || "No specific files"}`,
    `  Evidence: ${(task.evidenceIds ?? []).map((id) => `[${id}]`).join(", ") || "No direct evidence"}`,
    `  Verify: \`${task.verificationCommand}\``,
    `  Expected: ${task.expectedResult}`,
    ""
  ];
}

function formatEvidence(evidence: NonNullable<AutopsyReport["evidenceIndex"][string]>): string[] {
  const location = evidence.path ?? evidence.commitSha ?? evidence.kind;
  return [`- **[${evidence.id}]** ${location} - ${evidence.excerpt}`];
}
