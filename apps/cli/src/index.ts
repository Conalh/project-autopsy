#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
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

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCli(args: string[], options: GitHubInspectionOptions = {}): Promise<CliResult> {
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
    stderr: [
      "Usage:",
      "  project-autopsy inspect <path-or-github-url> [--branch name] [--format markdown|json] [--save] [--db path] [--check-registry] [--github-token token]",
      "  project-autopsy runs [--db path]",
      "  project-autopsy show <run_id> [--format markdown|json] [--db path]",
      "",
      "This slice supports local repository paths, public GitHub URLs, and Markdown or JSON output."
    ].join("\n") + "\n"
  };
}

async function main(): Promise<void> {
  const result = await runCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
