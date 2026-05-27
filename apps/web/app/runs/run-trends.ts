import type { SavedAnalysisRunSummary } from "@project-autopsy/core";

export interface RunTrendItem {
  id: string;
  projectName: string;
  createdAt: string;
  dateLabel: string;
  score: number;
  verdictStatus: SavedAnalysisRunSummary["verdictStatus"];
  scoreDelta?: number;
}

export interface RunTrendSummary {
  itemCount: number;
  latestScore?: number;
  latestDelta?: number;
  bestScore?: number;
}

export function buildRunTrendItems(runs: SavedAnalysisRunSummary[], limit = 10): RunTrendItem[] {
  const recentRuns = runs.slice(0, limit).reverse();

  return recentRuns.map((run, index) => {
    const previous = recentRuns[index - 1];

    return {
      id: run.id,
      projectName: run.projectName,
      createdAt: run.createdAt,
      dateLabel: formatDate(run.createdAt),
      score: run.score,
      verdictStatus: run.verdictStatus,
      scoreDelta: previous ? run.score - previous.score : undefined
    };
  });
}

export function buildRunTrendSummary(items: RunTrendItem[]): RunTrendSummary {
  const latest = items.at(-1);
  const bestScore = items.reduce<number | undefined>(
    (best, item) => (best === undefined ? item.score : Math.max(best, item.score)),
    undefined
  );

  return {
    itemCount: items.length,
    latestScore: latest?.score,
    latestDelta: latest?.scoreDelta,
    bestScore
  };
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return parsed.toISOString().slice(0, 10);
}
