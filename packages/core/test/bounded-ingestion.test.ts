import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { analyzeRepository, inspectGitHubRepository, inspectLocalRepository } from "../src/index.js";

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

describe("bounded ingestion", () => {
  test("records local file, depth, byte, and symlink truncation as explicit completeness metadata", async () => {
    const repoPath = await tempRepo("bounded-local");
    await mkdir(path.join(repoPath, "src"), { recursive: true });
    await mkdir(path.join(repoPath, "deep", "nested"), { recursive: true });
    await writeFile(path.join(repoPath, "README.md"), "# Bounded\n\nLocal bounded fixture.\n");
    await writeFile(path.join(repoPath, "src", "a.ts"), "export const a = 1;\n");
    await writeFile(path.join(repoPath, "src", "b.ts"), "export const b = 1;\n");
    await writeFile(path.join(repoPath, "src", "c.ts"), "export const c = 1;\n");
    await writeFile(path.join(repoPath, "deep", "nested", "hidden.ts"), "export const hidden = 1;\n");
    await writeFile(path.join(repoPath, "large.bin"), "x".repeat(4096));
    await symlink(path.join(repoPath, "src"), path.join(repoPath, "src-link"), "dir");

    const snapshot = await inspectLocalRepository(repoPath, {
      budgets: {
        maxFiles: 3,
        maxDepth: 1,
        maxTotalBytes: 128
      }
    });

    expect(snapshot.files.length).toBeLessThanOrEqual(3);
    expect(snapshot.completeness.files.status).toBe("partial");
    expect(snapshot.completeness.files.skipped).toBeGreaterThan(0);
    expect(snapshot.completeness.files.reasons).toEqual(
      expect.arrayContaining(["file-count-limit", "max-depth", "total-byte-limit", "symlink-skipped"])
    );
    expect(snapshot.ingestionWarnings?.join("\n")).toContain("file inventory");
  });

  test("marks missing validation provisional when the source inventory was truncated", async () => {
    const repoPath = await tempRepo("bounded-validation");
    await mkdir(path.join(repoPath, "src"), { recursive: true });
    await writeFile(path.join(repoPath, "README.md"), "# Partial\n\nPartial validation fixture.\n");
    await writeFile(path.join(repoPath, "src", "index.ts"), "export const x = 1;\n");
    await writeFile(path.join(repoPath, "src", "other.ts"), "export const y = 1;\n");

    const report = await analyzeRepository(repoPath, {
      budgets: {
        maxFiles: 2
      }
    });

    const validation = report.findings.find((finding) => finding.kind === "validation-surface");
    expect(validation?.severity).not.toBe("high");
    expect(`${validation?.title} ${validation?.body}`).toMatch(/provisional|inconclusive/i);
  });

  test("rejects symlinks that resolve outside the inspection root", async () => {
    const repoPath = await tempRepo("symlink-root");
    const outsidePath = await tempRepo("symlink-outside");
    await writeFile(path.join(repoPath, "README.md"), "# Symlink\n\nFixture.\n");
    await writeFile(path.join(outsidePath, "secret.ts"), "export const secret = true;\n");
    await symlink(path.join(outsidePath, "secret.ts"), path.join(repoPath, "secret-link.ts"), "file");

    const snapshot = await inspectLocalRepository(repoPath);

    expect(snapshot.files.map((file) => file.path)).not.toContain("secret-link.ts");
    expect(snapshot.completeness.files.status).toBe("partial");
    expect(snapshot.completeness.files.reasons).toContain("symlink-escapes-root");
  });

  test("skips oversized manifests before persistence and records manifest completeness", async () => {
    const repoPath = await tempRepo("oversized-manifest");
    await writeFile(path.join(repoPath, "README.md"), "# Huge manifest\n\nFixture.\n");
    await writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "x".repeat(128) }));

    const snapshot = await inspectLocalRepository(repoPath, {
      budgets: {
        maxManifestBytes: 16
      }
    });

    expect(snapshot.manifests).toHaveLength(0);
    expect(snapshot.completeness.manifests.status).toBe("partial");
    expect(snapshot.completeness.manifests.oversized).toBe(1);
    expect(snapshot.ingestionWarnings?.join("\n")).toContain("manifest");
  });

  test("resolves slash-containing GitHub branches after paginating branch discovery", async () => {
    const calls: string[] = [];
    const pageOneBranches = Array.from({ length: 100 }, (_, index) => ({
      name: `feature/page-one-${index}`,
      commit: { sha: `sha-page-one-${index}` }
    }));

    const githubFetch = (async (input: string | URL | Request) => {
      const url = input.toString();
      calls.push(url);
      if (url === "https://api.github.com/repos/acme/widget") {
        return jsonResponse({ name: "widget", full_name: "acme/widget", html_url: "", default_branch: "main" });
      }
      if (url === "https://api.github.com/repos/acme/widget/branches?per_page=100&page=1") {
        return jsonResponse(pageOneBranches);
      }
      if (url === "https://api.github.com/repos/acme/widget/branches?per_page=100&page=2") {
        return jsonResponse([{ name: "release/2026/q2", commit: { sha: "sha-release-q2" } }]);
      }
      if (url === "https://api.github.com/repos/acme/widget/git/trees/sha-release-q2?recursive=1") {
        return jsonResponse({
          sha: "sha-release-q2",
          truncated: false,
          tree: [
            { path: "README.md", type: "blob", size: 20 },
            { path: "package.json", type: "blob", size: 40 }
          ]
        });
      }
      if (url === "https://api.github.com/repos/acme/widget/contents/README.md?ref=sha-release-q2") {
        return jsonResponse({ path: "README.md", encoding: "base64", content: base64("# Widget\n") });
      }
      if (url === "https://api.github.com/repos/acme/widget/contents/package.json?ref=sha-release-q2") {
        return jsonResponse({ path: "package.json", encoding: "base64", content: base64('{"name":"widget"}') });
      }
      if (url === "https://api.github.com/repos/acme/widget/commits?sha=sha-release-q2&per_page=20") {
        return jsonResponse([]);
      }
      return jsonResponse({ message: `unhandled ${url}` }, 404);
    }) as typeof fetch;

    const snapshot = await inspectGitHubRepository(
      { url: "https://github.com/acme/widget/tree/release/2026/q2" },
      { fetch: githubFetch }
    );

    expect(snapshot.defaultBranch).toBe("release/2026/q2");
    expect(calls).toEqual(
      expect.arrayContaining([
        "https://api.github.com/repos/acme/widget/branches?per_page=100&page=1",
        "https://api.github.com/repos/acme/widget/branches?per_page=100&page=2"
      ])
    );
  });

  test("marks slash-branch discovery incomplete separately from a completed absent-branch search", async () => {
    const pageBranches = Array.from({ length: 100 }, (_, index) => ({
      name: `feature/page-${index}`,
      commit: { sha: `sha-page-${index}` }
    }));
    const githubFetch = (async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "https://api.github.com/repos/acme/incomplete") {
        return jsonResponse({ name: "incomplete", full_name: "acme/incomplete", html_url: "", default_branch: "main" });
      }
      if (
        url === "https://api.github.com/repos/acme/incomplete/branches?per_page=100&page=1" ||
        url === "https://api.github.com/repos/acme/incomplete/branches?per_page=100&page=2"
      ) {
        return jsonResponse(pageBranches);
      }
      if (url === "https://api.github.com/repos/acme/incomplete/git/trees/release%2Fmissing?recursive=1") {
        return jsonResponse({ sha: "raw", truncated: false, tree: [] });
      }
      return jsonResponse({ message: `unhandled ${url}` }, 404);
    }) as typeof fetch;

    const snapshot = await inspectGitHubRepository(
      { url: "https://github.com/acme/incomplete/tree/release/missing" },
      { fetch: githubFetch, budgets: { maxHttpRequests: 4 } }
    );

    expect(snapshot.completeness.files.status).toBe("partial");
    expect(snapshot.completeness.files.reasons).toContain("github-branch-discovery-incomplete");
  });

  test("rejects oversized GitHub responses while reading the response stream", async () => {
    const encoder = new TextEncoder();
    const githubFetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('{"name":"'));
            controller.enqueue(encoder.encode("x".repeat(128)));
            controller.close();
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )) as typeof fetch;

    await expect(
      inspectGitHubRepository(
        { url: "https://github.com/acme/oversized" },
        { fetch: githubFetch, budgets: { maxResponseBytes: 16 } }
      )
    ).rejects.toThrow(/response exceeded 16 bytes/);
  });

  test("keeps successful GitHub dependency results when another content lookup fails", async () => {
    const githubFetch = (async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "https://api.github.com/repos/acme/partial") {
        return jsonResponse({ name: "partial", full_name: "acme/partial", html_url: "", default_branch: "main" });
      }
      if (url === "https://api.github.com/repos/acme/partial/git/trees/main?recursive=1") {
        return jsonResponse({
          sha: "main",
          truncated: false,
          tree: [
            { path: "README.md", type: "blob", size: 20 },
            { path: "package.json", type: "blob", size: 60 },
            { path: "packages/api/package.json", type: "blob", size: 60 }
          ]
        });
      }
      if (url === "https://api.github.com/repos/acme/partial/contents/README.md?ref=main") {
        return jsonResponse({ path: "README.md", encoding: "base64", content: base64("# Partial\n") });
      }
      if (url === "https://api.github.com/repos/acme/partial/contents/package.json?ref=main") {
        return jsonResponse({
          path: "package.json",
          encoding: "base64",
          content: base64(JSON.stringify({ name: "partial", dependencies: { next: "^12.0.0" } }))
        });
      }
      if (url === "https://api.github.com/repos/acme/partial/contents/packages/api/package.json?ref=main") {
        return jsonResponse({ message: "temporary failure" }, 502);
      }
      if (url === "https://api.github.com/repos/acme/partial/commits?sha=main&per_page=20") {
        return jsonResponse([]);
      }
      return jsonResponse({ message: `unhandled ${url}` }, 404);
    }) as typeof fetch;

    const report = await analyzeRepository("https://github.com/acme/partial", {
      fetch: githubFetch,
      checkDependencyRegistry: true,
      npmRegistryFetch: createSelectiveRegistryFetch({ next: "16.0.0" })
    });

    expect(report.snapshot.manifests.map((manifest) => manifest.path)).toEqual([
      "package.json",
      "packages/api/package.json"
    ]);
    expect(report.findings.map((finding) => finding.title)).toContain(
      "npm dependency is behind the latest major: next"
    );
    expect(report.findings.some((finding) => finding.kind === "manifest-parse")).toBe(true);
  });

  test("globally limits registry concurrency and preserves successful lookups when one dependency fails", async () => {
    const repoPath = await tempRepo("registry-budget");
    await writeFile(path.join(repoPath, "README.md"), "# Registry\n\nRegistry fixture.\n");
    await writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({
        name: "registry",
        dependencies: {
          next: "^12.0.0",
          missing: "^1.0.0",
          typescript: "^4.0.0"
        }
      })
    );

    let active = 0;
    let maxActive = 0;
    const registryFetch = (async (input: string | URL | Request) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;

      const packageName = decodeURIComponent(input.toString().split("/").pop() ?? "");
      if (packageName === "missing") {
        return jsonResponse({ error: "missing" }, 503);
      }
      return jsonResponse({
        "dist-tags": {
          latest: packageName === "next" ? "16.0.0" : "5.0.0"
        }
      });
    }) as typeof fetch;

    const report = await analyzeRepository(repoPath, {
      checkDependencyRegistry: true,
      npmRegistryFetch: registryFetch,
      budgets: {
        registryConcurrency: 1
      }
    });

    const titles = report.findings.map((finding) => finding.title);
    expect(maxActive).toBe(1);
    expect(titles).toEqual(expect.arrayContaining(["npm dependency is behind the latest major: next"]));
    expect(titles).toEqual(expect.arrayContaining(["npm dependency is behind the latest major: typescript"]));
    expect(titles).toEqual(expect.arrayContaining(["npm dependency freshness was not checked: missing"]));
  });
});

function createSelectiveRegistryFetch(latestVersions: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const packageName = decodeURIComponent(input.toString().split("/").pop() ?? "");
    const latest = latestVersions[packageName];
    if (!latest) {
      return jsonResponse({ error: "not found" }, 404);
    }
    return jsonResponse({ "dist-tags": { latest } });
  }) as typeof fetch;
}
