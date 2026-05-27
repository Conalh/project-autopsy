import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { analyzeRepository, inspectLocalRepository, renderMarkdownReport } from "../src/index.js";

const fixtureRoot = path.resolve("../../fixtures");

const expectedFixtures = [
  { name: "stalled-npm-app", manager: "npm" },
  { name: "python-service", manager: "python" },
  { name: "rust-cli", manager: "rust" },
  { name: "go-worker", manager: "go" },
  { name: "mixed-stack", manager: "npm" }
] as const;

describe("Goal 0 fixture skeleton", () => {
  test("commits durable fixture repositories for the first supported ecosystems", async () => {
    for (const fixture of expectedFixtures) {
      const fixturePath = path.join(fixtureRoot, fixture.name);

      expect(existsSync(path.join(fixturePath, "README.md"))).toBe(true);

      const snapshot = await inspectLocalRepository(fixturePath);

      expect(snapshot.manifests.some((manifest) => manifest.manager === fixture.manager)).toBe(true);
      expect(snapshot.files.some((file) => file.kind === "source")).toBe(true);
      expect(snapshot.commits).toEqual([]);
    }
  });

  test("renders a deterministic Markdown report from the stalled npm fixture", async () => {
    const report = await analyzeRepository(path.join(fixtureRoot, "stalled-npm-app"));
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("# Project Autopsy: Stalled Notes App");
    expect(markdown).toContain("No git history was available");
    expect(markdown).toContain("README references missing npm script: npm run dev");
    expect(markdown).toContain("Documented file is missing: docs/dashboard.png");
    expect(markdown).toContain("## Revival Plan");
  });
});
