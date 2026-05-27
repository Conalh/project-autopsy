#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  analyzeRepository,
  isGitHubUrl,
  renderMarkdownReport,
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

  if (command !== "inspect" || !targetPath || format !== "markdown") {
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

    const report = await analyzeRepository(targetPath, { ...options, branch });
    return {
      exitCode: 0,
      stdout: renderMarkdownReport(report),
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

function readFormat(args: string[]): "markdown" | undefined {
  const value = readOption(args, "--format") ?? "markdown";
  return value === "markdown" ? "markdown" : undefined;
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
      "  project-autopsy inspect <path-or-github-url> [--branch name] [--format markdown]",
      "",
      "This slice supports local repository paths, public GitHub URLs, and Markdown output."
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
