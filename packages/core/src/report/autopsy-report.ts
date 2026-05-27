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
  StallHypothesis
} from "../types.js";
import { assignEvidenceIds } from "./evidence.js";
import { createRevivalTasks } from "./revival-plan.js";
import { countFindings, createVerdict } from "./scoring.js";

const ANALYZER_VERSION = "0.3.0";
const REPORT_SCHEMA_VERSION = "1.0";

export async function analyzeRepository(
  source: string,
  options: GitHubInspectionOptions = {}
): Promise<AutopsyReport> {
  const snapshot = isGitHubUrl(source)
    ? await inspectGitHubRepository({ url: source, branch: options.branch }, options)
    : await inspectLocalRepository(source);
  const rawFindings = [
    ...detectProjectIdentity(snapshot),
    ...detectMomentumBreak(snapshot),
    ...detectSetupRisk(snapshot),
    ...detectValidationSurface(snapshot),
    ...detectDocsDrift(snapshot)
  ];
  const { findings, evidenceIndex } = assignEvidenceIds(rawFindings);
  const verdict = createVerdict(findings);

  return {
    metadata: {
      analyzerVersion: ANALYZER_VERSION,
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      source: snapshot.sourceType,
      generatedAt: new Date().toISOString()
    },
    verdict,
    summary: {
      projectName: snapshot.summary.projectName,
      sourceType: snapshot.sourceType,
      fileCount: snapshot.fileCount,
      technologies: snapshot.summary.technologies,
      findingCounts: countFindings(findings)
    },
    snapshot,
    findings,
    stallHypotheses: createStallHypotheses(findings),
    revivalTasks: createRevivalTasks(findings),
    evidenceIndex
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
