import path from "node:path";
import { describe, expect, test } from "vitest";
import { analyzeRepository, renderJsonReport, renderMarkdownReport } from "../src/index.js";

const fixturePath = path.resolve("../../fixtures/stalled-npm-app");

describe("Goal 3 report MVP", () => {
  test("builds a structured autopsy report with score, verdict, metadata, and evidence index", async () => {
    const report = await analyzeRepository(fixturePath);

    expect(report.metadata).toMatchObject({
      analyzerVersion: "0.3.0",
      reportSchemaVersion: "1.0",
      source: "local_path"
    });
    expect(report.verdict.score).toBeLessThan(70);
    expect(report.verdict.status).toBe("at-risk");
    expect(report.verdict.summary).toContain("high-severity");
    expect(report.summary).toMatchObject({
      projectName: "Stalled Notes App",
      fileCount: 4
    });
    expect(report.summary.findingCounts.high).toBe(2);
    expect(Object.keys(report.evidenceIndex)).toContain("EV-001");
    expect(report.findings.every((finding) => finding.id && finding.evidenceIds.length > 0)).toBe(true);
  });

  test("creates revival tasks with stable ids and evidence references", async () => {
    const report = await analyzeRepository(fixturePath);

    expect(report.revivalTasks.map((task) => task.id)).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
    expect(report.revivalTasks[0]).toMatchObject({
      phase: "Phase 1",
      priority: 1,
      evidenceIds: expect.arrayContaining(["EV-003", "EV-004"])
    });
  });

  test("renders polished Markdown with score and evidence index", async () => {
    const markdown = renderMarkdownReport(await analyzeRepository(fixturePath));

    expect(markdown).toContain("**Score:** ");
    expect(markdown).toContain("**Status:** at-risk");
    expect(markdown).toContain("## Evidence Index");
    expect(markdown).toContain("[EV-003]");
    expect(markdown).toContain("TASK-001");
  });

  test("renders stable JSON report output", async () => {
    const json = renderJsonReport(await analyzeRepository(fixturePath));
    const parsed = JSON.parse(json);

    expect(parsed.verdict.status).toBe("at-risk");
    expect(parsed.revivalTasks[0].id).toBe("TASK-001");
    expect(parsed.evidenceIndex["EV-003"].excerpt).toBe("npm run dev");
  });
});
