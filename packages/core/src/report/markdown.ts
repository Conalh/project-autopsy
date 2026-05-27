import type { AutopsyReport, Finding, RevivalTask, StallHypothesis } from "../types.js";

export function renderMarkdownReport(report: AutopsyReport): string {
  const lines = [
    `# Project Autopsy: ${report.snapshot.summary.projectName}`,
    "",
    "## Verdict",
    "",
    createVerdict(report),
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
    ...report.revivalTasks.flatMap(formatTask)
  ];

  return `${lines.join("\n").trim()}\n`;
}

function createVerdict(report: AutopsyReport): string {
  const highCount = report.findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = report.findings.filter((finding) => finding.severity === "medium").length;

  if (highCount > 0) {
    return `This repo is reviveable, but ${highCount} high-severity issue(s) should be handled before feature work.`;
  }

  if (mediumCount > 0) {
    return `This repo is reviveable with cleanup. ${mediumCount} medium-severity issue(s) need attention.`;
  }

  return "This repo looks stable in the first-pass autopsy.";
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
    `- **${finding.title}** (${finding.severity})`,
    `  ${finding.body}`,
    ...finding.evidence.map((evidence) => {
      const location = evidence.path ?? evidence.commitSha ?? evidence.kind;
      return `  Evidence: ${location} - ${evidence.excerpt}`;
    }),
    ""
  ];
}

function formatTask(task: RevivalTask): string[] {
  return [
    `- **${task.phase}: ${task.title}**`,
    `  ${task.rationale}`,
    `  Files: ${task.files.join(", ") || "No specific files"}`,
    `  Verify: \`${task.verificationCommand}\``,
    `  Expected: ${task.expectedResult}`,
    ""
  ];
}
