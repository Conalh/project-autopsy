import type { AutopsyReport, Finding, RevivalTask, StallHypothesis } from "../types.js";

export function renderMarkdownReport(report: AutopsyReport): string {
  const lines = [
    `# Project Autopsy: ${report.snapshot.summary.projectName}`,
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
