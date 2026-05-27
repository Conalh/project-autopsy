import { describe, expect, test } from "vitest";
import type { SavedAnalysisRunSummary } from "@project-autopsy/core";
import {
  buildRunFilterOptions,
  createRunFilters,
  filterRuns,
  groupRunsByProjectAndSource
} from "./run-filters";

const runs: SavedAnalysisRunSummary[] = [
  createRunSummary("run_3", "Project Alpha", "https://github.com/acme/alpha", "github_url", "stable", 91),
  createRunSummary("run_2", "Project Alpha", "https://github.com/acme/alpha", "github_url", "at-risk", 30),
  createRunSummary("run_1", "Local Fixture", "fixtures/stalled-npm-app", "local_path", "needs-cleanup", 68)
];

describe("saved run filters", () => {
  test("normalizes supported query params and drops unsupported enum values", () => {
    expect(createRunFilters({ q: " alpha ", status: "stable", sourceType: "github_url" })).toEqual({
      query: "alpha",
      status: "stable",
      sourceType: "github_url"
    });
    expect(createRunFilters({ status: "unknown", sourceType: "remote" })).toEqual({
      query: "",
      status: "",
      sourceType: ""
    });
  });

  test("builds stable filter option sets from saved runs", () => {
    expect(buildRunFilterOptions(runs)).toEqual({
      statuses: ["at-risk", "needs-cleanup", "stable"],
      sourceTypes: ["github_url", "local_path"]
    });
  });

  test("filters by query, verdict status, and source type", () => {
    expect(
      filterRuns(runs, {
        query: "alpha",
        status: "stable",
        sourceType: "github_url"
      }).map((run) => run.id)
    ).toEqual(["run_3"]);

    expect(
      filterRuns(runs, {
        query: "stalled",
        status: "",
        sourceType: "local_path"
      }).map((run) => run.id)
    ).toEqual(["run_1"]);
  });

  test("groups filtered runs by project and source while preserving newest-first order", () => {
    expect(groupRunsByProjectAndSource(runs)).toEqual([
      {
        key: "Project Alpha\nhttps://github.com/acme/alpha",
        projectName: "Project Alpha",
        source: "https://github.com/acme/alpha",
        runs: [runs[0], runs[1]]
      },
      {
        key: "Local Fixture\nfixtures/stalled-npm-app",
        projectName: "Local Fixture",
        source: "fixtures/stalled-npm-app",
        runs: [runs[2]]
      }
    ]);
  });
});

function createRunSummary(
  id: string,
  projectName: string,
  source: string,
  sourceType: SavedAnalysisRunSummary["sourceType"],
  verdictStatus: SavedAnalysisRunSummary["verdictStatus"],
  score: number
): SavedAnalysisRunSummary {
  return {
    id,
    source,
    sourceType,
    projectName,
    score,
    verdictStatus,
    createdAt: "2026-05-27T12:00:00.000Z"
  };
}
