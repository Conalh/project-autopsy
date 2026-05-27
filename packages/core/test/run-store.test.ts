import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  analyzeAndSaveRepository,
  createSqliteRunStore,
  renderMarkdownReport
} from "../src/index.js";

const fixturePath = path.resolve("../../fixtures/stalled-npm-app");

describe("Goal 5 run persistence", () => {
  test("saves, lists, and loads analysis runs from SQLite", async () => {
    const dbPath = path.join(await mkdtemp(path.join(tmpdir(), "project-autopsy-store-")), "runs.sqlite");
    const store = createSqliteRunStore(dbPath);

    const saved = await analyzeAndSaveRepository(fixturePath, { store });
    const runs = store.listRuns();
    const loaded = store.getRun(saved.id);

    expect(saved.id).toMatch(/^run_/);
    expect(runs[0]).toMatchObject({
      id: saved.id,
      source: fixturePath,
      projectName: "Stalled Notes App",
      score: 17,
      verdictStatus: "at-risk"
    });
    expect(loaded?.report.verdict.status).toBe("at-risk");
    expect(loaded?.markdown).toBe(renderMarkdownReport(saved.report));
  });

  test("keeps repeated analyses as separate saved runs", async () => {
    const dbPath = path.join(await mkdtemp(path.join(tmpdir(), "project-autopsy-store-")), "runs.sqlite");
    const store = createSqliteRunStore(dbPath);

    const first = await analyzeAndSaveRepository(fixturePath, { store });
    const second = await analyzeAndSaveRepository(fixturePath, { store });

    expect(first.id).not.toBe(second.id);
    expect(store.listRuns()).toHaveLength(2);
  });
});
