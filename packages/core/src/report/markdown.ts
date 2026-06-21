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
    `- Latest commit: ${report.snapshot.commits[0]?.message || "No commit history found"}`,
    `- Technologies: ${report.snapshot.summary.technologies.join(", ") || "Unknown"}`,
    "",
    "## Inspection Completeness",
    "",
    ...formatInspectionCompleteness(report),
    "## Activity Timeline",
    "",
    ...formatActivityTimeline(report),
    "## Dependency Focus",
    "",
    ...formatDependencyFocus(report),
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

function formatInspectionCompleteness(report: AutopsyReport): string[] {
  const { completeness } = report.snapshot;
  const lines = [
    `- Files: ${formatCompletenessLine(completeness.files.status, completeness.files.included, completeness.files.discovered, completeness.files.skipped, completeness.files.reasons)}`,
    `- Manifests: ${formatCompletenessLine(completeness.manifests.status, completeness.manifests.read, completeness.manifests.discovered, completeness.manifests.skipped + completeness.manifests.failed, completeness.manifests.reasons)}`,
    `- Documentation: ${formatCompletenessLine(completeness.docs.status, completeness.docs.read, completeness.docs.discovered, completeness.docs.skipped + completeness.docs.failed, completeness.docs.reasons)}`,
    `- Commits: ${formatCompletenessLine(completeness.commits.status, completeness.commits.read, completeness.commits.requested, completeness.commits.skipped, completeness.commits.reasons)}`
  ];

  if (completeness.http) {
    lines.push(
      `- GitHub API: ${completeness.http.status}; requests=${completeness.http.requestsMade}; failures=${completeness.http.failures}; oversized=${completeness.http.responsesTooLarge}; exhausted=${completeness.http.limitReached}${formatReasons(completeness.http.reasons)}`
    );
  }

  lines.push(
    `- Runtime: ${completeness.runtime.status}; elapsedMs=${completeness.runtime.elapsedMs}; limitMs=${completeness.runtime.limitMs}${formatReasons(completeness.runtime.reasons)}`,
    ""
  );

  return lines;
}

function formatCompletenessLine(
  status: string,
  read: number,
  discovered: number,
  skipped: number,
  reasons: string[]
): string {
  return `${status}; read=${read}; discovered=${discovered}; skipped=${skipped}${formatReasons(reasons)}`;
}

function formatReasons(reasons: string[]): string {
  return reasons.length > 0 ? `; reasons=${reasons.join(", ")}` : "";
}

function formatReportTitle(projectName: string): string {
  return projectName.toLowerCase() === "project autopsy" ? "Project Autopsy" : `Project Autopsy: ${projectName}`;
}

function formatActivityTimeline(report: AutopsyReport): string[] {
  if (report.snapshot.commits.length === 0) {
    return ["No commit history was available for this inspection.", ""];
  }

  return [
    ...report.snapshot.commits.slice(0, 5).map((commit) => {
      const shortSha = commit.sha.slice(0, 7);
      const author = commit.authorName || "Unknown author";
      return `- **${formatDate(commit.committedAt)}** \`${shortSha}\` ${commit.message || "Commit without a message"} - ${author}`;
    }),
    ""
  ];
}

function formatDependencyFocus(report: AutopsyReport): string[] {
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

  return [
    `- Manifests: ${report.snapshot.manifests.length}`,
    `- Managers: ${managers.size > 0 ? [...managers].sort().join(", ") : "none"}`,
    `- Runtime dependencies: ${dependencyCount}`,
    `- Dev dependencies: ${devDependencyCount}`,
    `- Scripts: ${scriptCount}`,
    `- Drift findings: ${report.findings.filter((finding) => finding.kind === "dependency-drift").length}`,
    ""
  ];
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

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return parsed.toISOString().slice(0, 10);
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
