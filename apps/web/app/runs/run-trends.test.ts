import { describe, expect, test } from "vitest";
import type { SavedAnalysisRunSummary } from "@project-autopsy/core";
import { buildRunTrendItems, buildRunTrendSummary } from "./run-trends";

const runs: SavedAnalysisRunSummary[] = [
  createRunSummary("run_newest", "2026-05-27T12:00:00.000Z", 88, "stable"),
  createRunSummary("run_middle", "2026-05-26T12:00:00.000Z", 72, "needs-cleanup"),
  createRunSummary("run_oldest", "2026-05-25T12:00:00.000Z", 40, "at-risk")
];

describe("saved run trends", () => {
  test("orders recent saved runs chronologically and computes score deltas", () => {
    expect(buildRunTrendItems(runs)).toEqual([
      {
        id: "run_oldest",
        projectName: "Fixture",
        createdAt: "2026-05-25T12:00:00.000Z",
        dateLabel: "2026-05-25",
        score: 40,
        verdictStatus: "at-risk",
        scoreDelta: undefined
      },
      {
        id: "run_middle",
        projectName: "Fixture",
        createdAt: "2026-05-26T12:00:00.000Z",
        dateLabel: "2026-05-26",
        score: 72,
        verdictStatus: "needs-cleanup",
        scoreDelta: 32
      },
      {
        id: "run_newest",
        projectName: "Fixture",
        createdAt: "2026-05-27T12:00:00.000Z",
        dateLabel: "2026-05-27",
        score: 88,
        verdictStatus: "stable",
        scoreDelta: 16
      }
    ]);
  });

  test("limits trend input before reversing into chronological order", () => {
    expect(buildRunTrendItems(runs, 2).map((item) => item.id)).toEqual(["run_middle", "run_newest"]);
  });

  test("summarizes latest, best, and latest delta", () => {
    expect(buildRunTrendSummary(buildRunTrendItems(runs))).toEqual({
      itemCount: 3,
      latestScore: 88,
      latestDelta: 16,
      bestScore: 88
    });
  });
});

function createRunSummary(
  id: string,
  createdAt: string,
  score: number,
  verdictStatus: SavedAnalysisRunSummary["verdictStatus"]
): SavedAnalysisRunSummary {
  return {
    id,
    source: "fixtures/stalled-npm-app",
    sourceType: "local_path",
    projectName: "Fixture",
    score,
    verdictStatus,
    createdAt
  };
}
