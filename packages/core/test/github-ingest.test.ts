import { describe, expect, test } from "vitest";
import {
  analyzeRepository,
  inspectGitHubRepository,
  parseGitHubUrl,
  renderMarkdownReport
} from "../src/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function base64Content(content: string): string {
  return Buffer.from(content, "utf8").toString("base64");
}

function createGitHubFetch(): {
  fetch: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const responses = new Map<string, unknown>([
    [
      "https://api.github.com/repos/acme/stalled-notes",
      {
        name: "stalled-notes",
        full_name: "acme/stalled-notes",
        html_url: "https://github.com/acme/stalled-notes",
        description: "A repo that stalled before validation existed.",
        default_branch: "main",
        stargazers_count: 7,
        forks_count: 1,
        open_issues_count: 3,
        pushed_at: "2026-01-02T03:04:05Z"
      }
    ],
    [
      "https://api.github.com/repos/acme/stalled-notes/git/trees/main?recursive=1",
      {
        sha: "tree-sha",
        truncated: false,
        tree: [
          { path: "README.md", type: "blob", size: 136, sha: "readme-sha" },
          { path: "package.json", type: "blob", size: 124, sha: "package-sha" },
          { path: "src/index.ts", type: "blob", size: 28, sha: "source-sha" },
          { path: "docs/status.md", type: "blob", size: 38, sha: "docs-sha" }
        ]
      }
    ],
    [
      "https://api.github.com/repos/acme/stalled-notes/contents/README.md?ref=main",
      {
        path: "README.md",
        encoding: "base64",
        content: base64Content(
          [
            "# Stalled Notes App",
            "",
            "A GitHub-hosted notes app.",
            "",
            "Run `npm run dev`.",
            "",
            "Screenshot: `docs/dashboard.png`."
          ].join("\n")
        )
      }
    ],
    [
      "https://api.github.com/repos/acme/stalled-notes/contents/package.json?ref=main",
      {
        path: "package.json",
        encoding: "base64",
        content: base64Content(
          JSON.stringify({
            name: "stalled-notes",
            scripts: { build: "tsc" },
            dependencies: { next: "^12.0.0" }
          })
        )
      }
    ],
    [
      "https://api.github.com/repos/acme/stalled-notes/contents/docs/status.md?ref=main",
      {
        path: "docs/status.md",
        encoding: "base64",
        content: base64Content("# Status\n\nNo validation exists yet.\n")
      }
    ],
    [
      "https://api.github.com/repos/acme/stalled-notes/commits?sha=main&per_page=20",
      [
        {
          sha: "abc123",
          commit: {
            author: {
              name: "A. Maintainer",
              date: "2025-12-01T00:00:00Z"
            },
            message: "pause after scaffold"
          }
        }
      ]
    ]
  ]);

  return {
    calls,
    fetch: (async (input: string | URL | Request) => {
      const url = input.toString();
      calls.push(url);
      if (!responses.has(url)) {
        return jsonResponse({ message: `Unhandled URL: ${url}` }, 404);
      }
      return jsonResponse(responses.get(url));
    }) as typeof fetch
  };
}

describe("GitHub URL parsing", () => {
  test("parses public repository URLs and strips git suffixes", () => {
    expect(parseGitHubUrl("https://github.com/acme/stalled-notes.git")).toEqual({
      owner: "acme",
      repo: "stalled-notes",
      url: "https://github.com/acme/stalled-notes",
      branch: undefined
    });
  });

  test("parses branch URLs when the URL points at a tree", () => {
    expect(parseGitHubUrl("https://github.com/acme/stalled-notes/tree/main")).toEqual({
      owner: "acme",
      repo: "stalled-notes",
      url: "https://github.com/acme/stalled-notes",
      branch: "main"
    });
  });
});

describe("GitHub repository inspection", () => {
  test("normalizes a public GitHub repository into the shared snapshot shape", async () => {
    const github = createGitHubFetch();

    const snapshot = await inspectGitHubRepository(
      { url: "https://github.com/acme/stalled-notes" },
      { fetch: github.fetch }
    );

    expect(snapshot.sourceType).toBe("github_url");
    expect(snapshot.owner).toBe("acme");
    expect(snapshot.repo).toBe("stalled-notes");
    expect(snapshot.defaultBranch).toBe("main");
    expect(snapshot.files.find((file) => file.path === "src/index.ts")?.kind).toBe("source");
    expect(snapshot.manifests[0]).toMatchObject({ manager: "npm", path: "package.json" });
    expect(snapshot.docs.map((doc) => doc.path)).toEqual(["README.md", "docs/status.md"]);
    expect(snapshot.commits[0]).toMatchObject({
      sha: "abc123",
      message: "pause after scaffold"
    });
    expect(github.calls).toContain(
      "https://api.github.com/repos/acme/stalled-notes/git/trees/main?recursive=1"
    );
  });

  test("analyzes GitHub URLs through the same report pipeline as local paths", async () => {
    const github = createGitHubFetch();

    const markdown = renderMarkdownReport(
      await analyzeRepository("https://github.com/acme/stalled-notes", { fetch: github.fetch })
    );

    expect(markdown).toContain("# Project Autopsy: Stalled Notes App");
    expect(markdown).toContain("README references missing npm script: npm run dev");
    expect(markdown).toContain("Latest visible momentum: pause after scaffold");
    expect(markdown).toContain("Documented file is missing: docs/dashboard.png");
  });
});
