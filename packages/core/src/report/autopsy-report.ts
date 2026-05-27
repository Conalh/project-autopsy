import { detectDocsDrift } from "../detect/docs-drift.js";
import { detectProjectIdentity } from "../detect/identity.js";
import { detectMomentumBreak } from "../detect/momentum-break.js";
import { detectSetupRisk } from "../detect/setup-risk.js";
import { detectValidationSurface } from "../detect/validation-surface.js";
import {
  inspectGitHubRepository,
  isGitHubUrl,
  type GitHubInspectionOptions
} from "../ingest/github.js";
import { inspectLocalRepository } from "../ingest/local.js";
import type {
  AutopsyReport,
  Finding,
  RevivalTask,
  StallHypothesis
} from "../types.js";

export async function analyzeRepository(
  source: string,
  options: GitHubInspectionOptions = {}
): Promise<AutopsyReport> {
  const snapshot = isGitHubUrl(source)
    ? await inspectGitHubRepository({ url: source, branch: options.branch }, options)
    : await inspectLocalRepository(source);
  const findings = [
    ...detectProjectIdentity(snapshot),
    ...detectMomentumBreak(snapshot),
    ...detectSetupRisk(snapshot),
    ...detectValidationSurface(snapshot),
    ...detectDocsDrift(snapshot)
  ];

  return {
    snapshot,
    findings,
    stallHypotheses: createStallHypotheses(findings),
    revivalTasks: createRevivalTasks(findings)
  };
}

function createStallHypotheses(findings: Finding[]): StallHypothesis[] {
  const highSeverityKinds = new Set(
    findings.filter((finding) => finding.severity === "high").map((finding) => finding.kind)
  );

  const hypotheses: StallHypothesis[] = [];

  if (highSeverityKinds.has("setup-risk") || highSeverityKinds.has("validation-surface")) {
    hypotheses.push({
      rank: hypotheses.length + 1,
      title: "The project likely stalled around reproducibility and validation",
      confidence: "medium",
      rationale:
        "The highest severity findings point to setup instructions or local validation being unreliable.",
      supportingFindingKinds: [...highSeverityKinds]
    });
  }

  if (findings.some((finding) => finding.kind === "docs-drift")) {
    hypotheses.push({
      rank: hypotheses.length + 1,
      title: "The documentation may have drifted away from the actual repository",
      confidence: "medium",
      rationale:
        "The docs reference files or surfaces that are absent from the inspected file tree.",
      supportingFindingKinds: ["docs-drift"]
    });
  }

  if (hypotheses.length === 0) {
    hypotheses.push({
      rank: 1,
      title: "No strong stall pattern found in the first-pass heuristics",
      confidence: "low",
      rationale: "The current slice found only informational or low-severity findings.",
      supportingFindingKinds: findings.map((finding) => finding.kind)
    });
  }

  return hypotheses.map((hypothesis, index) => ({ ...hypothesis, rank: index + 1 }));
}

function createRevivalTasks(findings: Finding[]): RevivalTask[] {
  const tasks: RevivalTask[] = [];

  if (findings.some((finding) => finding.kind === "setup-risk")) {
    tasks.push({
      phase: "Phase 1",
      title: "Make setup reproducible",
      rationale: "Fix the setup and install risks before adding product behavior.",
      files: collectEvidencePaths(findings, "setup-risk"),
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
      verificationCommand: "git status --short",
      expectedResult: "The repository state is understood before making revival changes.",
      priority: 0
    });
  }

  return tasks;
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
