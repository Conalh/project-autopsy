import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { analyzeRepository, renderMarkdownReport } from "../src/index.js";

async function createNpmFixture(): Promise<string> {
  const repoPath = await mkdtemp(path.join(tmpdir(), "project-autopsy-drift-"));
  await mkdir(path.join(repoPath, "src"), { recursive: true });
  await writeFile(path.join(repoPath, "README.md"), "# Drift Fixture\n\nA package drift fixture.\n");
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "drift-fixture",
        scripts: {
          test: "vitest run"
        },
        dependencies: {
          next: "^12.0.0",
          react: "^18.2.0"
        },
        devDependencies: {
          typescript: "^4.9.0"
        }
      },
      null,
      2
    )
  );
  await writeFile(path.join(repoPath, "package-lock.json"), "{}\n");
  await writeFile(path.join(repoPath, "src", "index.ts"), "export const fixture = true;\n");

  return repoPath;
}

async function createPythonFixture(): Promise<string> {
  const repoPath = await mkdtemp(path.join(tmpdir(), "project-autopsy-python-drift-"));
  await mkdir(path.join(repoPath, "src"), { recursive: true });
  await writeFile(path.join(repoPath, "README.md"), "# Python Drift Fixture\n\nA Python package drift fixture.\n");
  await writeFile(
    path.join(repoPath, "pyproject.toml"),
    [
      "[project]",
      'name = "python-drift-fixture"',
      'version = "0.1.0"',
      'dependencies = ["fastapi>=0.100", "pydantic>=2.5.0"]',
      "",
      "[project.optional-dependencies]",
      'dev = ["pytest>=7.0"]',
      ""
    ].join("\n")
  );
  await writeFile(path.join(repoPath, "src", "__init__.py"), "\n");

  return repoPath;
}

describe("dependency drift detector", () => {
  test("reports npm dependencies when registry latest versions are newer major releases", async () => {
    const repoPath = await createNpmFixture();

    const report = await analyzeRepository(repoPath, {
      checkDependencyRegistry: true,
      npmRegistryFetch: createRegistryFetch({
        next: "16.2.6",
        react: "18.3.1",
        typescript: "5.9.3"
      })
    });

    const driftFindings = report.findings.filter((finding) => finding.kind === "dependency-drift");

    expect(driftFindings.map((finding) => finding.title)).toEqual([
      "npm dependency is behind the latest major: next",
      "npm dev dependency is behind the latest major: typescript"
    ]);
    expect(driftFindings[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "manifest",
          path: "package.json",
          excerpt: "next declared ^12.0.0, latest 16.2.6"
        })
      ])
    );
    expect(renderMarkdownReport(report)).toContain("latest major: next");
  });

  test("reports registry misses as informational not-checked findings", async () => {
    const repoPath = await createNpmFixture();

    const report = await analyzeRepository(repoPath, {
      checkDependencyRegistry: true,
      npmRegistryFetch: createFailingRegistryFetch()
    });

    const finding = report.findings.find((entry) => entry.kind === "dependency-drift");

    expect(finding).toMatchObject({
      severity: "info",
      title: "npm dependency freshness was not checked",
      body: expect.stringContaining("Registry lookup failed")
    });
  });

  test("reports Python dependencies when PyPI latest versions are newer major releases", async () => {
    const repoPath = await createPythonFixture();

    const report = await analyzeRepository(repoPath, {
      checkDependencyRegistry: true,
      pypiRegistryFetch: createPypiRegistryFetch({
        fastapi: "1.2.0",
        pydantic: "2.8.2",
        pytest: "8.4.0"
      })
    });

    const driftFindings = report.findings.filter((finding) => finding.kind === "dependency-drift");

    expect(driftFindings.map((finding) => finding.title)).toEqual([
      "Python dependency is behind the latest major: fastapi",
      "Python dev dependency is behind the latest major: pytest"
    ]);
    expect(driftFindings[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "manifest",
          path: "pyproject.toml",
          excerpt: "fastapi declared >=0.100, latest 1.2.0"
        })
      ])
    );
  });
});

function createRegistryFetch(latestVersions: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const packageName = decodeURIComponent(input.toString().split("/").pop() ?? "");
    const latest = latestVersions[packageName];
    if (!latest) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ "dist-tags": { latest } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
}

function createFailingRegistryFetch(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ error: "registry unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;
}

function createPypiRegistryFetch(latestVersions: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const packageName = decodeURIComponent(input.toString().split("/").at(-2) ?? "");
    const latest = latestVersions[packageName];
    if (!latest) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ info: { version: latest } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
}
