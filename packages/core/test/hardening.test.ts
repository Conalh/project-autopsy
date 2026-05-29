import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  analyzeRepository,
  inspectGitHubRepository,
  inspectLocalRepository,
  parseGitHubUrl
} from "../src/index.js";

async function tempRepo(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `project-autopsy-${prefix}-`));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function base64(content: string): string {
  return Buffer.from(content, "utf8").toString("base64");
}

describe("#2 nested manifest discovery", () => {
  test("discovers workspace manifests in subdirectories and ignores vendored copies", async () => {
    const repoPath = await tempRepo("nested");
    await mkdir(path.join(repoPath, "packages", "lib"), { recursive: true });
    await mkdir(path.join(repoPath, "services", "api"), { recursive: true });
    await mkdir(path.join(repoPath, "dist", "old"), { recursive: true });

    await writeFile(path.join(repoPath, "README.md"), "# Monorepo\n\nA monorepo.\n");
    await writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*"] }));
    await writeFile(path.join(repoPath, "packages", "lib", "package.json"), JSON.stringify({ name: "@scope/lib" }));
    await writeFile(
      path.join(repoPath, "services", "api", "pyproject.toml"),
      ['[project]', 'name = "api"', 'version = "0.1.0"'].join("\n")
    );
    await writeFile(path.join(repoPath, "dist", "old", "package.json"), JSON.stringify({ name: "generated" }));

    const snapshot = await inspectLocalRepository(repoPath);
    const manifestPaths = snapshot.manifests.map((manifest) => manifest.path);

    expect(manifestPaths).toEqual(
      expect.arrayContaining(["package.json", "packages/lib/package.json", "services/api/pyproject.toml"])
    );
    expect(manifestPaths).not.toContain("dist/old/package.json");
    // Root manifest still names the project (nested manifests do not override it).
    expect(snapshot.summary.projectName).toBe("Monorepo");
  });
});

describe("#6 malformed manifests become findings", () => {
  test("does not crash on invalid JSON and reports a manifest-parse finding", async () => {
    const repoPath = await tempRepo("broken");
    await mkdir(path.join(repoPath, "src"), { recursive: true });
    await writeFile(path.join(repoPath, "README.md"), "# Broken\n\nBroken manifest.\n");
    await writeFile(path.join(repoPath, "package.json"), "{ \"name\": \"broken\", oops }");
    await writeFile(path.join(repoPath, "src", "index.ts"), "export const x = 1;\n");

    const report = await analyzeRepository(repoPath);

    const parseFinding = report.findings.find((finding) => finding.kind === "manifest-parse");
    expect(parseFinding).toMatchObject({
      severity: "medium",
      title: "Manifest could not be parsed: package.json"
    });
    expect(report.snapshot.manifests[0]?.parseError).toBeTruthy();
  });
});

describe("#7 broadened test detection", () => {
  test("classifies framework test conventions as tests", async () => {
    const repoPath = await tempRepo("tests");
    await mkdir(path.join(repoPath, "src"), { recursive: true });
    await mkdir(path.join(repoPath, "__tests__"), { recursive: true });
    await writeFile(path.join(repoPath, "README.md"), "# Tested\n\nTested.\n");
    await writeFile(path.join(repoPath, "src", "index.ts"), "export const x = 1;\n");
    await writeFile(path.join(repoPath, "src", "widget.test.tsx"), "export const t = 1;\n");
    await writeFile(path.join(repoPath, "src", "helpers_test.go"), "package main\n");
    await writeFile(path.join(repoPath, "src", "test_app.py"), "def test_app():\n    pass\n");
    await writeFile(path.join(repoPath, "__tests__", "smoke.ts"), "export const s = 1;\n");

    const snapshot = await inspectLocalRepository(repoPath);
    const testPaths = snapshot.files.filter((file) => file.kind === "test").map((file) => file.path);

    expect(testPaths).toEqual(
      expect.arrayContaining([
        "src/widget.test.tsx",
        "src/helpers_test.go",
        "src/test_app.py",
        "__tests__/smoke.ts"
      ])
    );

    const validation = (await analyzeRepository(repoPath)).findings.find(
      (finding) => finding.kind === "validation-surface"
    );
    expect(validation?.severity).toBe("info");
  });

  test("downgrades the no-tests finding when a test script is configured", async () => {
    const repoPath = await tempRepo("testscript");
    await mkdir(path.join(repoPath, "src"), { recursive: true });
    await writeFile(path.join(repoPath, "README.md"), "# Configured\n\nHas a test script.\n");
    await writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({ name: "configured", scripts: { test: "vitest run" } })
    );
    await writeFile(path.join(repoPath, "src", "index.ts"), "export const x = 1;\n");

    const validation = (await analyzeRepository(repoPath)).findings.find(
      (finding) => finding.kind === "validation-surface"
    );

    expect(validation?.severity).toBe("medium");
    expect(validation?.title).toContain("Validation is configured");
  });
});

describe("#8 ecosystem-aware revival commands", () => {
  test("uses pytest for a Python project", async () => {
    const repoPath = await tempRepo("py");
    await mkdir(path.join(repoPath, "src"), { recursive: true });
    await writeFile(path.join(repoPath, "README.md"), "# Py\n\nA python service.\n");
    await writeFile(
      path.join(repoPath, "pyproject.toml"),
      ['[project]', 'name = "svc"', 'version = "0.1.0"', 'dependencies = ["fastapi"]'].join("\n")
    );
    await writeFile(path.join(repoPath, "src", "app.py"), "print('hi')\n");

    const report = await analyzeRepository(repoPath);
    const validationTask = report.revivalTasks.find((task) => task.phase === "Phase 2");

    expect(validationTask?.verificationCommand).toBe("pytest");
  });

  test("uses go test for a Go project", async () => {
    const repoPath = await tempRepo("go");
    await mkdir(path.join(repoPath, "cmd"), { recursive: true });
    await writeFile(path.join(repoPath, "README.md"), "# Go\n\nA go worker.\n");
    await writeFile(path.join(repoPath, "go.mod"), "module example.com/worker\n\ngo 1.22\n");
    await writeFile(path.join(repoPath, "cmd", "main.go"), "package main\n\nfunc main() {}\n");

    const report = await analyzeRepository(repoPath);
    const validationTask = report.revivalTasks.find((task) => task.phase === "Phase 2");

    expect(validationTask?.verificationCommand).toBe("go test ./...");
  });
});

describe("#9 dependency drift robustness", () => {
  test("skips workspace and git ranges instead of mis-flagging or failing", async () => {
    const repoPath = await tempRepo("drift-skip");
    await mkdir(path.join(repoPath, "src"), { recursive: true });
    await writeFile(path.join(repoPath, "README.md"), "# Drift\n\nDrift skip.\n");
    await writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({
        name: "drift-skip",
        dependencies: {
          next: "^12.0.0",
          internal: "workspace:*",
          forked: "github:acme/forked"
        }
      })
    );
    await writeFile(path.join(repoPath, "src", "index.ts"), "export const x = 1;\n");

    const requested: string[] = [];
    const registryFetch = (async (input: string | URL | Request) => {
      const url = input.toString();
      requested.push(url);
      const name = decodeURIComponent(url.split("/").pop() ?? "");
      if (name === "next") {
        return jsonResponse({ "dist-tags": { latest: "16.0.0" } });
      }
      return jsonResponse({ error: "not found" }, 404);
    }) as typeof fetch;

    const report = await analyzeRepository(repoPath, { checkDependencyRegistry: true, npmRegistryFetch: registryFetch });
    const drift = report.findings.filter((finding) => finding.kind === "dependency-drift");

    expect(drift.map((finding) => finding.title)).toEqual([
      "npm dependency is behind the latest major: next"
    ]);
    // Workspace / git deps must never be looked up against the registry.
    expect(requested.some((url) => url.includes("internal") || url.includes("forked"))).toBe(false);
  });

  test("looks up a shared dependency once across workspaces", async () => {
    const repoPath = await tempRepo("drift-cache");
    await mkdir(path.join(repoPath, "packages", "a"), { recursive: true });
    await mkdir(path.join(repoPath, "packages", "b"), { recursive: true });
    await writeFile(path.join(repoPath, "README.md"), "# Cache\n\nShared dep.\n");
    await writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "root" }));
    await writeFile(
      path.join(repoPath, "packages", "a", "package.json"),
      JSON.stringify({ name: "a", dependencies: { react: "^17.0.0" } })
    );
    await writeFile(
      path.join(repoPath, "packages", "b", "package.json"),
      JSON.stringify({ name: "b", dependencies: { react: "^17.0.0" } })
    );

    let reactCalls = 0;
    const registryFetch = (async (input: string | URL | Request) => {
      const name = decodeURIComponent(input.toString().split("/").pop() ?? "");
      if (name === "react") {
        reactCalls += 1;
        return jsonResponse({ "dist-tags": { latest: "18.0.0" } });
      }
      return jsonResponse({ error: "not found" }, 404);
    }) as typeof fetch;

    const report = await analyzeRepository(repoPath, { checkDependencyRegistry: true, npmRegistryFetch: registryFetch });
    const drift = report.findings.filter((finding) => finding.kind === "dependency-drift");

    expect(drift).toHaveLength(2);
    expect(reactCalls).toBe(1);
  });
});

describe("#5 GitHub branch parsing", () => {
  test("captures slash-containing refs from tree URLs", () => {
    expect(parseGitHubUrl("https://github.com/acme/widget/tree/feature/new-ui").branch).toBe("feature/new-ui");
    expect(parseGitHubUrl("https://github.com/acme/widget/tree/main/packages/lib").branch).toBe(
      "main/packages/lib"
    );
  });

  test("resolves slash branches and branch+subpath refs against the branches API", async () => {
    const branchFetch = createWidgetFetch();

    const slashBranch = await inspectGitHubRepository(
      { url: "https://github.com/acme/widget/tree/feature/new-ui" },
      { fetch: branchFetch.fetch }
    );
    expect(slashBranch.defaultBranch).toBe("feature/new-ui");

    const subpath = await inspectGitHubRepository(
      { url: "https://github.com/acme/widget/tree/main/packages/lib" },
      { fetch: branchFetch.fetch }
    );
    expect(subpath.defaultBranch).toBe("main");

    expect(branchFetch.calls).toContain("https://api.github.com/repos/acme/widget/branches?per_page=100");
    expect(branchFetch.calls).toContain(
      "https://api.github.com/repos/acme/widget/git/trees/sha-feature?recursive=1"
    );
  });
});

describe("#3 GitHub tree truncation", () => {
  test("surfaces a high-severity finding when the tree is truncated", async () => {
    const truncatedFetch = (async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "https://api.github.com/repos/acme/big") {
        return jsonResponse({ name: "big", full_name: "acme/big", html_url: "", default_branch: "main" });
      }
      if (url === "https://api.github.com/repos/acme/big/git/trees/main?recursive=1") {
        return jsonResponse({
          sha: "t",
          truncated: true,
          tree: [{ path: "README.md", type: "blob", size: 20 }]
        });
      }
      if (url === "https://api.github.com/repos/acme/big/contents/README.md?ref=main") {
        return jsonResponse({ path: "README.md", encoding: "base64", content: base64("# Big\n") });
      }
      if (url.startsWith("https://api.github.com/repos/acme/big/commits")) {
        return jsonResponse([]);
      }
      return jsonResponse({ message: `unhandled ${url}` }, 404);
    }) as typeof fetch;

    const report = await analyzeRepository("https://github.com/acme/big", { fetch: truncatedFetch });
    const integrity = report.findings.find((finding) => finding.kind === "ingestion-integrity");

    expect(integrity?.severity).toBe("high");
    expect(integrity?.title).toBe("Repository inspection may be incomplete");
  });
});

function createWidgetFetch(): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const tree = (sha: string) => ({
    sha,
    truncated: false,
    tree: [
      { path: "README.md", type: "blob", size: 40 },
      { path: "package.json", type: "blob", size: 60 },
      { path: "src/index.ts", type: "blob", size: 20 }
    ]
  });
  const pkg = base64(JSON.stringify({ name: "widget", scripts: { build: "tsc" } }));
  const readme = base64("# Widget\n\nA widget.\n");
  const commits = [
    { sha: "c1", commit: { author: { name: "Dev", date: "2025-01-01T00:00:00Z" }, message: "wip" } }
  ];

  const responses = new Map<string, unknown>([
    ["https://api.github.com/repos/acme/widget", { name: "widget", full_name: "acme/widget", html_url: "", default_branch: "main" }],
    [
      "https://api.github.com/repos/acme/widget/branches?per_page=100",
      [
        { name: "main", commit: { sha: "sha-main" } },
        { name: "feature/new-ui", commit: { sha: "sha-feature" } }
      ]
    ],
    ["https://api.github.com/repos/acme/widget/git/trees/sha-main?recursive=1", tree("sha-main")],
    ["https://api.github.com/repos/acme/widget/git/trees/sha-feature?recursive=1", tree("sha-feature")],
    ["https://api.github.com/repos/acme/widget/contents/package.json?ref=sha-main", { path: "package.json", encoding: "base64", content: pkg }],
    ["https://api.github.com/repos/acme/widget/contents/package.json?ref=sha-feature", { path: "package.json", encoding: "base64", content: pkg }],
    ["https://api.github.com/repos/acme/widget/contents/README.md?ref=sha-main", { path: "README.md", encoding: "base64", content: readme }],
    ["https://api.github.com/repos/acme/widget/contents/README.md?ref=sha-feature", { path: "README.md", encoding: "base64", content: readme }],
    ["https://api.github.com/repos/acme/widget/commits?sha=sha-main&per_page=20", commits],
    ["https://api.github.com/repos/acme/widget/commits?sha=sha-feature&per_page=20", commits]
  ]);

  return {
    calls,
    fetch: (async (input: string | URL | Request) => {
      const url = input.toString();
      calls.push(url);
      if (!responses.has(url)) {
        return jsonResponse({ message: `unhandled ${url}` }, 404);
      }
      return jsonResponse(responses.get(url));
    }) as typeof fetch
  };
}
