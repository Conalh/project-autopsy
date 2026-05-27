import type { Finding, RepoSnapshot } from "../types.js";

export function detectProjectIdentity(snapshot: RepoSnapshot): Finding[] {
  if (snapshot.summary.projectName && snapshot.summary.claimedValue) {
    return [
      {
        kind: "project-identity",
        severity: "info",
        title: `Project identity: ${snapshot.summary.projectName}`,
        body: snapshot.summary.claimedValue,
        evidence: [
          {
            kind: "docs",
            path: "README.md",
            excerpt: snapshot.summary.claimedValue
          }
        ]
      }
    ];
  }

  return [
    {
      kind: "project-identity",
      severity: "medium",
      title: "Project identity is unclear",
      body: "The repository does not expose a clear README title and value statement.",
      evidence: [
        {
          kind: "file",
          excerpt: "No README title and first-purpose paragraph were found."
        }
      ]
    }
  ];
}
