#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { analyzeRepository, renderMarkdownReport } from "@project-autopsy/core";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCli(args: string[]): Promise<CliResult> {
  const [command, targetPath, ...rest] = args;
  const format = readFormat(rest);

  if (command !== "inspect" || !targetPath || format !== "markdown") {
    return usageFailure();
  }

  try {
    const targetInfo = await stat(targetPath);
    if (!targetInfo.isDirectory()) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Path is not a directory: ${targetPath}\n`
      };
    }

    const report = await analyzeRepository(targetPath);
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
  const formatIndex = args.indexOf("--format");
  if (formatIndex === -1) {
    return "markdown";
  }

  return args[formatIndex + 1] === "markdown" ? "markdown" : undefined;
}

function usageFailure(): CliResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: [
      "Usage:",
      "  project-autopsy inspect <path> [--format markdown]",
      "",
      "This first slice supports local repository inspection and Markdown output."
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
