import type { Finding, RevivalTask } from "../types.js";
import { formatId } from "./evidence.js";

export function createRevivalTasks(findings: Finding[]): RevivalTask[] {
  const tasks: Omit<RevivalTask, "id">[] = [];

  if (findings.some((finding) => finding.kind === "setup-risk")) {
    tasks.push({
      phase: "Phase 1",
      title: "Make setup reproducible",
      rationale: "Fix the setup and install risks before adding product behavior.",
      files: collectEvidencePaths(findings, "setup-risk"),
      evidenceIds: collectEvidenceIds(findings, "setup-risk"),
      verificationCommand: "npm install && npm run build",
      expectedResult: "Dependencies install from a lockfile and the documented build command works.",
      priority: 1
    });
  }

  if (findings.some((finding) => finding.kind === "validation-surface" && finding.severity !== "info")) {
    tasks.push({
      phase: "Phase 2",
      title: "Restore a local validation command",
      rationale: "A revival needs one command that proves the current baseline.",
      files: collectEvidencePaths(findings, "validation-surface"),
      evidenceIds: collectEvidenceIds(findings, "validation-surface"),
      verificationCommand: "npm test",
      expectedResult: "A repeatable test command exists and reports a clear result.",
      priority: 2
    });
  }

  if (findings.some((finding) => finding.kind === "docs-drift")) {
    tasks.push({
      phase: "Phase 5",
      title: "Clean stale public documentation",
      rationale: "Portfolio or handoff readers should not hit missing files from the README.",
      files: collectEvidencePaths(findings, "docs-drift"),
      evidenceIds: collectEvidenceIds(findings, "docs-drift"),
      verificationCommand: "Search README and docs links for missing local references",
      expectedResult: "Documented files either exist or the references are removed.",
      priority: 5
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      phase: "Phase 0",
      title: "Preserve and inspect",
      rationale: "The first-pass report did not find urgent risks, so start with a clean baseline.",
      files: [],
      evidenceIds: [],
      verificationCommand: "git status --short",
      expectedResult: "The repository state is understood before making revival changes.",
      priority: 0
    });
  }

  return tasks.map((task, index) => ({
    ...task,
    id: formatId("TASK", index + 1)
  }));
}

function collectEvidencePaths(findings: Finding[], kind: string): string[] {
  return [
    ...new Set(
      findings
        .filter((finding) => finding.kind === kind)
        .flatMap((finding) => finding.evidence.map((item) => item.path))
        .filter((item): item is string => Boolean(item))
    )
  ];
}

function collectEvidenceIds(findings: Finding[], kind: string): string[] {
  return findings
    .filter((finding) => finding.kind === kind)
    .flatMap((finding) => finding.evidenceIds ?? []);
}
