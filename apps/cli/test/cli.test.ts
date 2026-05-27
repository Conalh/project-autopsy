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

  test("prints a markdown report for public GitHub URLs", async () => {
    const result = await runCli(["inspect", "https://github.com/acme/stalled-notes"], {
      fetch: createGitHubFetch()
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Project Autopsy: GitHub CLI Fixture");
    expect(result.stdout).toContain("README references missing npm script: npm run dev");
    expect(result.stderr).toBe("");
  });
});

function createGitHubFetch(): typeof fetch {
  const responses = new Map<string, unknown>([
    [
      "https://api.github.com/repos/acme/stalled-notes",
      {
        name: "stalled-notes",
        full_name: "acme/stalled-notes",
        html_url: "https://github.com/acme/stalled-notes",
        default_branch: "main"
      }
    ],
    [
      "https://api.github.com/repos/acme/stalled-notes/git/trees/main?recursive=1",
      {
        sha: "tree-sha",
        tree: [
          { path: "README.md", type: "blob", size: 80 },
          { path: "package.json", type: "blob", size: 64 },
          { path: "src/index.ts", type: "blob", size: 24 }
        ]
      }
    ],
    [
      "https://api.github.com/repos/acme/stalled-notes/contents/README.md?ref=main",
      {
        encoding: "base64",
        content: Buffer.from("# GitHub CLI Fixture\n\nA fixture repo.\n\nRun `npm run dev`.\n").toString("base64")
      }
    ],
    [
      "https://api.github.com/repos/acme/stalled-notes/contents/package.json?ref=main",
      {
        encoding: "base64",
        content: Buffer.from(JSON.stringify({ name: "stalled-notes", scripts: { build: "tsc" } })).toString(
          "base64"
        )
      }
    ],
    [
      "https://api.github.com/repos/acme/stalled-notes/commits?sha=main&per_page=20",
      []
    ]
  ]);

  return (async (input: string | URL | Request) => {
    const url = input.toString();
    if (!responses.has(url)) {
      return new Response(JSON.stringify({ message: `Unhandled URL: ${url}` }), { status: 404 });
    }

    return new Response(JSON.stringify(responses.get(url)), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
}
