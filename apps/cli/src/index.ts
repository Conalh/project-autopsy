#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  analyzeAndSaveRepository,
  analyzeRepository,
  createSqliteRunStore,
  isGitHubUrl,
  renderJsonReport,
  renderMarkdownReport,
  type SavedAnalysisRunSummary,
  type GitHubInspectionOptions
} from "@project-autopsy/core";

const CLI_VERSION = "0.1.0";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCli(args: string[], options: GitHubInspectionOptions = {}): Promise<CliResult> {
  if (args.includes("--help") || args.includes("-h")) {
    return {
      exitCode: 0,
      stdout: usageText(),
      stderr: ""
    };
  }

  if (args.includes("--version") || args.includes("-v")) {
    return {
      exitCode: 0,
      stdout: `project-autopsy ${CLI_VERSION}\n`,
      stderr: ""
    };
  }

  const [command, targetPath, ...rest] = args;
  const format = readFormat(rest);
  const branch = readOption(rest, "--branch");
  const dbPath = readOption(args, "--db");
  const checkDependencyRegistry = args.includes("--check-registry");
  const token = readOption(args, "--github-token") ?? process.env.PROJECT_AUTOPSY_GITHUB_TOKEN;

  if (command === "runs") {
    const store = createSqliteRunStore(dbPath);
    const runs = store.listRuns();
    return {
      exitCode: 0,
      stdout: formatRuns(runs),
      stderr: ""
    };
  }

  if (command === "show" && targetPath && format) {
    const store = createSqliteRunStore(dbPath);
    const saved = store.getRun(targetPath);
    if (!saved) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Saved run not found: ${targetPath}\n`
      };
    }
    return {
      exitCode: 0,
      stdout: format === "json" ? saved.json : saved.markdown,
      stderr: ""
    };
  }

  if (command !== "inspect" || !targetPath || !format) {
    return usageFailure();
  }

  try {
    if (!isGitHubUrl(targetPath)) {
      const targetInfo = await stat(targetPath);
      if (!targetInfo.isDirectory()) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `Path is not a directory: ${targetPath}\n`
        };
      }
    }

    if (args.includes("--save")) {
      const store = createSqliteRunStore(dbPath);
      const saved = await analyzeAndSaveRepository(targetPath, {
        ...options,
        branch,
        checkDependencyRegistry,
        token,
        store
      });
      return {
        exitCode: 0,
        stdout: format === "json" ? `${JSON.stringify(saved, null, 2)}\n` : saved.markdown,
        stderr: ""
      };
    }

    const report = await analyzeRepository(targetPath, {
      ...options,
      branch,
      checkDependencyRegistry,
      token
    });
    return {
      exitCode: 0,
      stdout: format === "json" ? renderJsonReport(report) : renderMarkdownReport(report),
      stderr: ""
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${error instanceof Error ? error.message : String(error)}\n`
    };
  }
}

function readFormat(args: string[]): "markdown" | "json" | undefined {
  const value = readOption(args, "--format") ?? "markdown";
  return value === "markdown" || value === "json" ? value : undefined;
}

function readOption(args: string[], name: string): string | undefined {
  const optionIndex = args.indexOf(name);
  if (optionIndex === -1) {
    return undefined;
  }

  return args[optionIndex + 1];
}

function usageFailure(): CliResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: usageText()
  };
}

function usageText(): string {
  return [
    "Project Autopsy",
    "",
    "Usage:",
    "  project-autopsy inspect <path-or-github-url> [--branch name] [--format markdown|json] [--save] [--db path] [--check-registry] [--github-token token]",
    "  project-autopsy runs [--db path]",
    "  project-autopsy show <run_id> [--format markdown|json] [--db path]",
    "",
    "Options:",
    "  --format markdown|json      Choose report output format. Defaults to markdown.",
    "  --save                      Persist the report to the local run store.",
    "  --db path                   Override the saved-run SQLite path.",
    "  --check-registry            Check npm, PyPI, and crates.io freshness.",
    "  --github-token token        Inspect private GitHub repositories.",
    "  --help, -h                  Show this help message.",
    "  --version, -v               Show the CLI version.",
    "",
    "Project Autopsy reads repository structure and metadata; it does not execute inspected repository commands."
  ].join("\n") + "\n";
}

async function main(): Promise<void> {
  const result = await runCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

export function isCliEntrypoint(argvPath = process.argv[1], moduleUrl = import.meta.url): boolean {
  if (!argvPath) {
    return false;
  }

  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return moduleUrl === pathToFileURL(argvPath).href;
  }
}

if (isCliEntrypoint()) {
  void main();
}

function formatRuns(runs: SavedAnalysisRunSummary[]): string {
  if (runs.length === 0) {
    return "No saved runs.\n";
  }

  return `${runs
    .map(
      (run) =>
        `${run.id}\t${run.projectName}\t${run.verdictStatus}\t${run.score}/100\t${run.source}`
    )
    .join("\n")}\n`;
}
