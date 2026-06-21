import type { Finding, RepoSnapshot } from "../types.js";
import { formatCompletenessReasons, hasPartialCommits } from "./uncertainty.js";

export function detectMomentumBreak(snapshot: RepoSnapshot): Finding[] {
  const latestCommit = snapshot.commits[0];
  if (!latestCommit) {
    if (hasPartialCommits(snapshot)) {
      return [
        {
          kind: "momentum-break",
          severity: "info",
          title: "Commit history was not fully inspected",
          body: `The analyzer could not make a definitive momentum conclusion because commit ingestion was incomplete (${formatCompletenessReasons(snapshot)}).`,
          evidence: [
            {
              kind: "commit",
              excerpt: "commit ingestion did not complete"
            }
          ]
        }
      ];
    }

    return [
      {
        kind: "momentum-break",
        severity: "low",
        title: "No git history was available",
        body: "The analyzer could not read commit history for this local path.",
        evidence: [
          {
            kind: "commit",
            excerpt: "git log returned no commits"
          }
        ]
      }
    ];
  }

  return [
    {
      kind: "momentum-break",
      severity: "info",
      title: `Latest visible momentum: ${latestCommit.message}`,
      body: "The latest commit is the current candidate for where inspection should begin.",
      evidence: [
        {
          kind: "commit",
          commitSha: latestCommit.sha,
          excerpt: latestCommit.message
        }
      ]
    }
  ];
}
