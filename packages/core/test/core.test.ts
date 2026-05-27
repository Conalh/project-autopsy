import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import {
  analyzeRepository,
  inspectLocalRepository,
  renderMarkdownReport
} from "../src/index.js";

async function createFixtureRepo(): Promise<string> {
  const repoPath = await mkdtemp(path.join(tmpdir(), "project-autopsy-"));

  await mkdir(path.join(repoPath, "src"), { recursive: true });
  await mkdir(path.join(repoPath, "docs"), { recursive: true });

  await writeFile(
    path.join(repoPath, "README.md"),
    [
      "# Stalled Notes App",
      "",
      "A small note-taking app for developers.",
      "",
      "## Setup",
      "",
      "Run `npm install` and then `npm run dev`.",
      "",
      "The dashboard screenshot lives at `docs/dashboard.png`."
    ].join("\n")
  );
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "stalled-notes",
        version: "0.1.0",
        scripts: {
          build: "tsc"
        },
        dependencies: {
          next: "^12.0.0"
        },
        devDependencies: {
          typescript: "^4.9.0"
        }
      },
      null,
      2
    )
  );
  await writeFile(path.join(repoPath, "src", "index.ts"), "export const app = 'notes';\n");
  await writeFile(path.join(repoPath, "docs", "ROADMAP.md"), "# Roadmap\n\n- Add sync\n");
  await mkdir(path.join(repoPath, "docs", "superpowers", "plans"), { recursive: true });
  await writeFile(
    path.join(repoPath, "docs", "superpowers", "plans", "future.md"),
    "This implementation plan mentions `package.json` and future `app/page.tsx` work.\n"
  );
  await writeFile(
    path.join(repoPath, "PLAN.md"),
    "Future package map includes `packages/core/src/ingest/github.ts`.\n"
  );

  execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: repoPath });
  execFileSync("git", ["config", "user.name", "Fixture User"], { cwd: repoPath });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: repoPath });
  execFileSync("git", ["add", "."], { cwd: repoPath });
  execFileSync("git", ["commit", "-m", "initial app surface"], { cwd: repoPath, stdio: "ignore" });

  return repoPath;
}

async function createValidatedRepo(): Promise<string> {
  const repoPath = await mkdtemp(path.join(tmpdir(), "project-autopsy-valid-"));

  await mkdir(path.join(repoPath, "src"), { recursive: true });
  await mkdir(path.join(repoPath, "test"), { recursive: true });
  await writeFile(path.join(repoPath, "README.md"), "# Validated App\n\nA tested app.\n");
  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "validated-app",
        scripts: {
          build: "tsc",
          test: "vitest run"
        }
      },
      null,
      2
    )
  );
  await writeFile(path.join(repoPath, "package-lock.json"), "{}\n");
  await writeFile(path.join(repoPath, "src", "index.ts"), "export const app = true;\n");
  await writeFile(path.join(repoPath, "test", "index.test.ts"), "export const testFile = true;\n");

  return repoPath;
}

describe("local repository inspection", () => {
  test("normalizes files, manifests, docs, and commits into a snapshot", async () => {
    const repoPath = await createFixtureRepo();

    const snapshot = await inspectLocalRepository(repoPath);

    expect(snapshot.sourceType).toBe("local_path");
    expect(snapshot.files.map((file) => file.path)).toContain("README.md");
    expect(snapshot.files.find((file) => file.path === "src/index.ts")?.kind).toBe("source");
    expect(snapshot.manifests[0]).toMatchObject({
      manager: "npm",
      path: "package.json"
    });
    expect(snapshot.docs.map((doc) => doc.path)).toContain("README.md");
    expect(snapshot.commits[0]).toMatchObject({
      message: "initial app surface"
    });
  });
});

describe("repository analysis", () => {
  test("produces evidence-backed findings and revival tasks", async () => {
    const repoPath = await createFixtureRepo();

    const report = await analyzeRepository(repoPath);

    expect(report.snapshot.summary.projectName).toBe("Stalled Notes App");
    expect(report.findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(["setup-risk", "validation-surface", "docs-drift"])
    );
    expect(report.findings.every((finding) => finding.evidence.length > 0)).toBe(true);
    expect(
      report.findings.filter((finding) => finding.kind === "docs-drift").map((finding) => finding.title)
    ).toEqual(["Documented file is missing: docs/dashboard.png"]);
    expect(report.stallHypotheses[0]?.confidence).toMatch(/low|medium|high/);
    expect(report.revivalTasks.map((task) => task.phase)).toEqual(
      expect.arrayContaining(["Phase 1", "Phase 2", "Phase 5"])
    );
  });

  test("renders a readable markdown report with verdict, findings, and tasks", async () => {
    const repoPath = await createFixtureRepo();

    const markdown = renderMarkdownReport(await analyzeRepository(repoPath));

    expect(markdown).toContain("# Project Autopsy: Stalled Notes App");
    expect(markdown).toContain("## Verdict");
    expect(markdown).toContain("## Top Findings");
    expect(markdown).toContain("## Revival Plan");
    expect(markdown).toContain("README.md");
    expect(markdown).toContain("npm run dev");
  });

  test("does not create validation revival tasks for informational validation findings", async () => {
    const repoPath = await createValidatedRepo();

    const report = await analyzeRepository(repoPath);

    expect(report.findings.find((finding) => finding.kind === "validation-surface")?.severity).toBe("info");
    expect(report.revivalTasks.map((task) => task.phase)).not.toContain("Phase 2");
  });

  test("self-inspection ignores generated sample report and manifest coverage examples", async () => {
    const repoPath = path.resolve("../..");

    const report = await analyzeRepository(repoPath);
    const markdown = renderMarkdownReport(report);
    const titles = report.findings.map((finding) => finding.title);

    expect(report.summary.projectName).toBe("Project Autopsy");
    expect(markdown).toContain("# Project Autopsy\n");
    expect(markdown).not.toContain("# Project Autopsy: Project Autopsy");
    expect(titles).not.toContain("README references missing npm script: npm run dev");
    expect(titles).not.toContain("Documented file is missing: docs/dashboard.png");
    expect(titles).not.toContain("Documented file is missing: .project-autopsy/github-app-installation.json");
    expect(titles).not.toContain("Documented file is missing: pyproject.toml");
    expect(titles).not.toContain("Documented file is missing: requirements.txt");
    expect(titles).not.toContain("Documented file is missing: Cargo.toml");
    expect(titles).not.toContain("Documented file is missing: go.mod");
  });
}
);
