import type { Finding, FindingCounts, ReportVerdict, Severity } from "../types.js";

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  info: 0,
  low: 3,
  medium: 10,
  high: 25
};

export function countFindings(findings: Finding[]): FindingCounts {
  return findings.reduce<FindingCounts>(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    { info: 0, low: 0, medium: 0, high: 0 }
  );
}

export function createVerdict(findings: Finding[]): ReportVerdict {
  const counts = countFindings(findings);
  const penalty = findings.reduce((total, finding) => total + SEVERITY_WEIGHTS[finding.severity], 0);
  const score = Math.max(0, 100 - penalty);

  if (counts.high > 0 || score < 70) {
    return {
      score,
      status: "at-risk",
      summary: `This repo is reviveable, but ${counts.high} high-severity issue(s) should be handled before feature work.`
    };
  }

  if (counts.medium > 0 || score < 90) {
    return {
      score,
      status: "needs-cleanup",
      summary: `This repo is reviveable with cleanup. ${counts.medium} medium-severity issue(s) need attention.`
    };
  }

  return {
    score,
    status: "stable",
    summary: "This repo looks stable in the first-pass autopsy."
  };
}
