import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { runCli } from "../src/index.js";

async function createCliFixture(): Promise<string> {
  const repoPath = await mkdtemp(path.join(tmpdir(), "project-autopsy-cli-"));
  await mkdir(path.join(repoPath, "src"), { recursive: true });
  await writeFile(
    path.join(repoPath, "README.md"),
    "# CLI Fixture\n\nA fixture app.\n\nRun `npm run dev`.\n"
  );
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify({ name: "cli-fixture", scripts: { build: "tsc" } }, null, 2)
  );
  await writeFile(path.join(repoPath, "src", "index.ts"), "export const fixture = true;\n");

  execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: repoPath });
  execFileSync("git", ["config", "user.name", "Fixture User"], { cwd: repoPath });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: repoPath });
  execFileSync("git", ["add", "."], { cwd: repoPath });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: repoPath, stdio: "ignore" });

  return repoPath;
}

describe("project-autopsy CLI", () => {
  test("prints a markdown report for inspect path", async () => {
    const repoPath = await createCliFixture();

    const result = await runCli(["inspect", repoPath, "--format", "markdown"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Project Autopsy: CLI Fixture");
    expect(result.stdout).toContain("## Revival Plan");
    expect(result.stdout).toContain("npm run dev");
    expect(result.stderr).toBe("");
  });

  test("returns usage failure for unsupported commands", async () => {
    const result = await runCli(["export"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });
});
