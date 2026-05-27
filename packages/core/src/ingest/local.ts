import { execFile } from "node:child_process";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  CommitSummary,
  FileRecord,
  ManifestRecord,
  RepoSnapshot
} from "../types.js";
import {
  classifyFile,
  createDocRecord,
  detectManifestManager,
  isDocPath,
  parseManifest,
  summarizeLanguages,
  summarizeProject
} from "./shared.js";

const execFileAsync = promisify(execFile);

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor"
]);

export async function inspectLocalRepository(rootPath: string): Promise<RepoSnapshot> {
  const resolvedRoot = path.resolve(rootPath);
  const rootInfo = await stat(resolvedRoot);
  if (!rootInfo.isDirectory()) {
    throw new Error(`Local repository path is not a directory: ${resolvedRoot}`);
  }

  const files = await walkFiles(resolvedRoot);
  const manifests = await readManifests(resolvedRoot, files);
  const docs = await readDocs(resolvedRoot, files);
  const isGitRoot = await isGitRepositoryRoot(resolvedRoot);
  const commits = isGitRoot ? await readCommits(resolvedRoot) : [];
  const summary = summarizeProject(docs, manifests, path.basename(resolvedRoot));

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
    summary
  };
}

async function isGitRepositoryRoot(rootPath: string): Promise<boolean> {
  const topLevel = await readGitValue(rootPath, ["rev-parse", "--show-toplevel"]);
  if (!topLevel) {
    return false;
  }

  return normalizePath(topLevel) === normalizePath(rootPath);
}

async function walkFiles(rootPath: string): Promise<FileRecord[]> {
  const records: FileRecord[] = [];

  async function visit(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = toPosix(path.relative(rootPath, absolutePath));

      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const info = await lstat(absolutePath);
      records.push({
        path: relativePath,
        extension: path.extname(entry.name).toLowerCase(),
        sizeBytes: info.size,
        kind: classifyFile(relativePath)
      });
    }
  }

  await visit(rootPath);
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

async function readManifests(rootPath: string, files: FileRecord[]): Promise<ManifestRecord[]> {
  const manifests: ManifestRecord[] = [];

  for (const file of files) {
    const manager = detectManifestManager(file.path);
    if (!manager) {
      continue;
    }

    const absolutePath = path.join(rootPath, file.path);
    const content = await readFile(absolutePath, "utf8");
    manifests.push(parseManifest(file.path, manager, content));
  }

  return manifests;
}

async function readDocs(rootPath: string, files: FileRecord[]) {
  const docFiles = files.filter((file) => file.kind === "docs" && isDocPath(file.path));
  const docs = [];

  for (const file of docFiles) {
    const content = await readFile(path.join(rootPath, file.path), "utf8");
    docs.push(createDocRecord(file.path, content));
  }

  return docs;
}

async function readCommits(rootPath: string): Promise<CommitSummary[]> {
  const output = await readGitValue(rootPath, [
    "log",
    "-20",
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
