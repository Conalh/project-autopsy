import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { analyzeRepository, renderJsonReport, renderMarkdownReport } from "../src/index.js";

const sampleRoot = path.resolve("../../docs/sample-reports");
const fixturePath = path.resolve("../../fixtures/stalled-npm-app");
const stableGeneratedAt = "1970-01-01T00:00:00.000Z";

describe("sample reports", () => {
  test("keeps committed stalled npm sample reports in sync", async () => {
    const report = await analyzeRepository(fixturePath);
    report.metadata.generatedAt = stableGeneratedAt;
    report.snapshot.rootPath = "fixtures/stalled-npm-app";

    await expect(readSample("stalled-npm-app.md")).resolves.toBe(renderMarkdownReport(report));
    await expect(readSample("stalled-npm-app.json")).resolves.toBe(renderJsonReport(report));
  });
});

async function readSample(fileName: string): Promise<string> {
  return readFile(path.join(sampleRoot, fileName), "utf8");
}
