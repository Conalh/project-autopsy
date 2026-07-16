import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  CommitSummary,
  DocRecord,
  FileRecord,
  InspectionBudgetOverrides,
  InspectionBudgets,
  IngestionCompleteness,
  ManifestCompleteness,
  ManifestRecord,
  RepoSnapshot
} from "../types.js";
import {
  completenessStatus,
  createInspectionBudgetContext,
  isRuntimeExpired,
  type InspectionBudgetContext,
  uniqueReasons
} from "./budgets.js";
import {
  IGNORED_DIRECTORIES,
  classifyFile,
  createDocRecord,
  parseManifest,
  selectDocTargets,
  selectManifestTargets,
  summarizeLanguages,
  summarizeProject
} from "./shared.js";

const execFileAsync = promisify(execFile);

const IGNORED_DIRS = IGNORED_DIRECTORIES;

export interface LocalInspectionOptions {
  budgets?: InspectionBudgetOverrides;
  budgetContext?: InspectionBudgetContext;
}

interface WalkResult {
  files: FileRecord[];
  discovered: number;
  skipped: number;
  reasons: string[];
}

interface ManifestReadResult {
  manifests: ManifestRecord[];
  completeness: ManifestCompleteness;
}

export async function inspectLocalRepository(
  rootPath: string,
  options: LocalInspectionOptions = {}
): Promise<RepoSnapshot> {
  const budgetContext = options.budgetContext ?? createInspectionBudgetContext(options.budgets);
  const { budgets, startedAt } = budgetContext;
  const resolvedRoot = path.resolve(rootPath);
  const rootInfo = await stat(resolvedRoot);
  if (!rootInfo.isDirectory()) {
    throw new Error(`Local repository path is not a directory: ${resolvedRoot}`);
  }

  const walk = await walkFiles(resolvedRoot, budgets, budgetContext);
  const files = walk.files;
  const manifestResult = await readManifests(resolvedRoot, files, budgets);
  const manifests = manifestResult.manifests;
  const docResult = await readDocs(resolvedRoot, files, budgets);
  const docs = docResult.docs;
  const isGitRoot = await isGitRepositoryRoot(resolvedRoot);
  const commits = isGitRoot ? await readCommits(resolvedRoot, budgets.maxCommits) : [];
  const summary = summarizeProject(docs, manifests, path.basename(resolvedRoot));
  const elapsedMs = Date.now() - startedAt;
  const runtimeTimedOut = isRuntimeExpired(budgetContext);
  const completeness: IngestionCompleteness = {
    files: {
      status: completenessStatus(walk.skipped, walk.reasons),
      discovered: walk.discovered,
      included: files.length,
      skipped: walk.skipped,
      reasons: walk.reasons
    },
    manifests: manifestResult.completeness,
    docs: docResult.completeness,
    commits: {
      status: "complete",
      requested: isGitRoot ? budgets.maxCommits : 0,
      read: commits.length,
      skipped: 0,
      reasons: isGitRoot ? [] : ["not-a-git-root"]
    },
    runtime: {
      status: runtimeTimedOut ? "partial" : "complete",
      elapsedMs,
      limitMs: budgets.maxRuntimeMs,
      timedOut: runtimeTimedOut,
      reasons: runtimeTimedOut ? ["runtime-limit"] : []
    }
  };

  const ingestionWarnings = createIngestionWarnings(completeness);

  return {
    sourceType: "local_path",
    rootPath: resolvedRoot,
    defaultBranch: isGitRoot ? await readGitValue(resolvedRoot, ["branch", "--show-current"]) : undefined,
    headSha: isGitRoot ? await readGitValue(resolvedRoot, ["rev-parse", "HEAD"]) : undefined,
    fileCount: files.length,
    totalSizeBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
    languages: summarizeLanguages(files),
    files,
    manifests,
    docs,
    commits,
    summary,
    completeness,
    ...(ingestionWarnings.length > 0 ? { ingestionWarnings } : {})
  };
}

async function isGitRepositoryRoot(rootPath: string): Promise<boolean> {
  const topLevel = await readGitValue(rootPath, ["rev-parse", "--show-toplevel"]);
  if (!topLevel) {
    return false;
  }

  return normalizePath(topLevel) === normalizePath(rootPath);
}

async function walkFiles(
  rootPath: string,
  budgets: InspectionBudgets,
  budgetContext: InspectionBudgetContext
): Promise<WalkResult> {
  const records: FileRecord[] = [];
  const reasons: string[] = [];
  let discovered = 0;
  let skipped = 0;
  let totalBytes = 0;
  const normalizedRoot = normalizePath(rootPath);

  async function visit(currentPath: string, depth: number): Promise<void> {
    if (isRuntimeExpired(budgetContext)) {
      reasons.push("runtime-limit");
      return;
    }

    const entries = (await readdir(currentPath, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name)
    );

    for (const entry of entries) {
      if (isRuntimeExpired(budgetContext)) {
        reasons.push("runtime-limit");
        return;
      }

      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = toPosix(path.relative(rootPath, absolutePath));

      if (entry.isSymbolicLink()) {
        skipped += 1;
        reasons.push(await symlinkReason(absolutePath, normalizedRoot));
        continue;
      }

      if (entry.isDirectory()) {
        if (depth >= budgets.maxDepth) {
          skipped += 1;
          reasons.push("max-depth");
          continue;
        }
        await visit(absolutePath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      discovered += 1;
      const info = await lstat(absolutePath);
      if (records.length >= budgets.maxFiles) {
        skipped += 1;
        reasons.push("file-count-limit");
        continue;
      }
      if (totalBytes + info.size > budgets.maxTotalBytes) {
        skipped += 1;
        reasons.push("total-byte-limit");
        continue;
      }
      records.push({
        path: relativePath,
        extension: path.extname(entry.name).toLowerCase(),
        sizeBytes: info.size,
        kind: classifyFile(relativePath)
      });
      totalBytes += info.size;
    }
  }

  await visit(rootPath, 0);
  return {
    files: records.sort((left, right) => left.path.localeCompare(right.path)),
    discovered,
    skipped,
    reasons: uniqueReasons(reasons)
  };
}

async function symlinkReason(absolutePath: string, normalizedRoot: string): Promise<string> {
  try {
    const target = normalizePath(await realpath(absolutePath));
    return target === normalizedRoot || target.startsWith(`${normalizedRoot}/`)
      ? "symlink-skipped"
      : "symlink-escapes-root";
  } catch {
    return "symlink-skipped";
  }
}

async function readManifests(
  rootPath: string,
  files: FileRecord[],
  budgets: InspectionBudgets
): Promise<ManifestReadResult> {
  const manifests: ManifestRecord[] = [];
  const selection = selectManifestTargets(files, budgets);
  let failed = 0;

  for (const { file, manager } of selection.targets) {
    const absolutePath = path.join(rootPath, file.path);
    try {
      const content = await readFile(absolutePath, "utf8");
      manifests.push(parseManifest(file.path, manager, content));
    } catch (error) {
      failed += 1;
      manifests.push({
        path: file.path,
        manager,
        parsed: {},
        scripts: {},
        dependencies: {},
        devDependencies: {},
        parseError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const reasons = uniqueReasons([...selection.reasons, ...(failed > 0 ? ["manifest-read-failed"] : [])]);
  return {
    manifests,
    completeness: {
      status: completenessStatus(selection.skipped + failed, reasons),
      discovered: selection.discovered,
      read: selection.targets.length - failed,
      skipped: selection.skipped,
      oversized: selection.oversized,
      failed,
      reasons
    }
  };
}

async function readDocs(
  rootPath: string,
  files: FileRecord[],
  budgets: InspectionBudgets
): Promise<{ docs: DocRecord[]; completeness: IngestionCompleteness["docs"] }> {
  const selection = selectDocTargets(files, budgets);
  const docFiles = selection.files;
  const docs: DocRecord[] = [];
  let unreadable = 0;

  for (const file of docFiles) {
    try {
      const content = await readFile(path.join(rootPath, file.path), "utf8");
      docs.push(createDocRecord(file.path, content));
    } catch {
      unreadable += 1;
    }
  }

  const reasons = uniqueReasons([...selection.reasons, ...(unreadable > 0 ? ["doc-read-failed"] : [])]);
  return {
    docs,
    completeness: {
      status: completenessStatus(selection.skipped + unreadable, reasons),
      discovered: selection.discovered,
      read: docs.length,
      skipped: selection.skipped,
      oversized: selection.oversized,
      failed: unreadable,
      reasons
    }
  };
}

async function readCommits(rootPath: string, maxCommits: number): Promise<CommitSummary[]> {
  const output = await readGitValue(rootPath, [
    "log",
    `-${maxCommits}`,
    "--pretty=format:%H%x1f%an%x1f%aI%x1f%s"
  ]);

  if (!output) {
    return [];
  }

  return output.split(/\r?\n/).map((line) => {
    const [sha = "", authorName = "", committedAt = "", message = ""] = line.split("\x1f");
    return { sha, authorName, committedAt, message };
  });
}

async function readGitValue(rootPath: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: rootPath });
    const value = stdout.trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath).replaceAll("\\", "/").toLowerCase();
}

function createIngestionWarnings(completeness: IngestionCompleteness): string[] {
  const warnings: string[] = [];

  if (completeness.files.status === "partial") {
    warnings.push(
      `Repository file inventory was incomplete: ${completeness.files.skipped} item(s) were skipped (${completeness.files.reasons.join(", ")}). Missing-file, missing-test, and dependency conclusions are provisional.`
    );
  }

  if (completeness.manifests.status === "partial") {
    warnings.push(
      `Manifest ingestion was incomplete: ${completeness.manifests.skipped} manifest(s) were skipped and ${completeness.manifests.failed} failed to read (${completeness.manifests.reasons.join(", ")}). Dependency and setup conclusions are provisional.`
    );
  }

  if (completeness.docs.status === "partial") {
    warnings.push(
      `Documentation ingestion was incomplete: ${completeness.docs.skipped} documentation file(s) were skipped and ${completeness.docs.failed} failed to read (${completeness.docs.reasons.join(", ")}). Documentation-drift conclusions are provisional.`
    );
  }

  if (completeness.runtime.status === "partial") {
    warnings.push(
      `Repository ingestion exceeded the runtime budget after ${completeness.runtime.elapsedMs}ms (${completeness.runtime.reasons.join(", ")}). Conclusions are provisional.`
    );
  }

  return warnings;
}
