import type { Evidence, Finding } from "../types.js";

export function assignEvidenceIds(findings: Finding[]): {
  findings: Finding[];
  evidenceIndex: Record<string, Evidence>;
} {
  let evidenceNumber = 1;
  const evidenceIndex: Record<string, Evidence> = {};

  const enrichedFindings = findings.map((finding, findingIndex) => {
    const evidence = finding.evidence.map((item) => {
      const id = formatId("EV", evidenceNumber++);
      const enriched = { ...item, id };
      evidenceIndex[id] = enriched;
      return enriched;
    });

    return {
      ...finding,
      id: formatId("FINDING", findingIndex + 1),
      evidence,
      evidenceIds: evidence.map((item) => item.id as string)
    };
  });

  return {
    findings: enrichedFindings,
    evidenceIndex
  };
}

export function formatId(prefix: string, value: number): string {
  return `${prefix}-${value.toString().padStart(3, "0")}`;
}
