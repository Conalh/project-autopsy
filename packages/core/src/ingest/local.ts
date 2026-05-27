import { execFile } from "node:child_process";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  CommitSummary,
  DocRecord,
  FileKind,
  FileRecord,
  ManifestManager,
  ManifestRecord,
  RepoSnapshot
} from "../types.js";

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

const SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cs",
  ".css",
  ".go",
  ".gd",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".py",
  ".rs",
  ".ts",
  ".tsx"
]);

const DOC_EXTENSIONS = new Set([".md", ".mdx", ".rst", ".txt"]);
const ASSET_EXTENSIONS = new Set([".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]);

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
  const summary = summarizeProject(docs, manifests);

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

function classifyFile(filePath: string): FileKind {
  const normalized = filePath.toLowerCase();
  const extension = path.extname(normalized);

  if (normalized.startsWith(".github/workflows/")) {
    return "workflow";
  }

  if (
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".test.js") ||
    normalized.endsWith(".spec.js")
  ) {
    return "test";
  }

  if (normalized === "readme.md" || normalized.startsWith("docs/") || DOC_EXTENSIONS.has(extension)) {
    return "docs";
  }

  if (
    normalized === "package.json" ||
    normalized === "pyproject.toml" ||
    normalized === "cargo.toml" ||
    normalized === "go.mod" ||
    normalized.endsWith(".csproj") ||
    normalized.endsWith(".sln") ||
    normalized.endsWith(".yml") ||
    normalized.endsWith(".yaml") ||
    normalized.endsWith(".json")
  ) {
    return "config";
  }

  if (ASSET_EXTENSIONS.has(extension)) {
    return "asset";
  }

  if (SOURCE_EXTENSIONS.has(extension)) {
    return "source";
  }

  return "unknown";
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

function detectManifestManager(filePath: string): ManifestManager | undefined {
  const normalized = filePath.toLowerCase();

  if (normalized === "package.json") return "npm";
  if (normalized === "pyproject.toml" || normalized === "requirements.txt") return "python";
  if (normalized === "cargo.toml") return "rust";
  if (normalized === "go.mod") return "go";
  if (normalized.endsWith(".csproj") || normalized.endsWith(".sln")) return "dotnet";
  if (normalized === "dockerfile" || normalized === "compose.yaml" || normalized === "docker-compose.yml") {
    return "docker";
  }
  if (normalized.startsWith(".github/workflows/")) return "github_actions";

  return undefined;
}

function parseManifest(pathName: string, manager: ManifestManager, content: string): ManifestRecord {
  if (manager === "npm") {
    const parsed = JSON.parse(content) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return {
      path: pathName,
      manager,
      parsed: parsed as Record<string, unknown>,
      scripts: parsed.scripts ?? {},
      dependencies: parsed.dependencies ?? {},
      devDependencies: parsed.devDependencies ?? {}
    };
  }

  return {
    path: pathName,
    manager,
    parsed: { raw: content },
    scripts: {},
    dependencies: {},
    devDependencies: {}
  };
}

async function readDocs(rootPath: string, files: FileRecord[]): Promise<DocRecord[]> {
  const docFiles = files.filter((file) => file.kind === "docs" && DOC_EXTENSIONS.has(file.extension));
  const docs: DocRecord[] = [];

  for (const file of docFiles) {
    const content = await readFile(path.join(rootPath, file.path), "utf8");
    docs.push({
      path: file.path,
      title: extractTitle(content),
      content
    });
  }

  return docs;
}

function extractTitle(content: string): string | undefined {
  const titleLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  return titleLine?.replace(/^#\s+/, "").trim();
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

function summarizeProject(docs: DocRecord[], manifests: ManifestRecord[]) {
  const readme = docs.find((doc) => doc.path.toLowerCase() === "readme.md");
  const npmManifest = manifests.find((manifest) => manifest.manager === "npm");
  const technologies = new Set<string>();

  for (const manifest of manifests) {
    technologies.add(manifest.manager);
    for (const dependencyName of Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies
    })) {
      technologies.add(dependencyName);
    }
  }

  return {
    projectName:
      readme?.title ??
      ((npmManifest?.parsed.name as string | undefined) ?? path.basename(process.cwd())),
    claimedValue: extractClaimedValue(readme?.content),
    technologies: [...technologies].sort()
  };
}

function extractClaimedValue(content: string | undefined): string | undefined {
  if (!content) {
    return undefined;
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));
}

function summarizeLanguages(files: FileRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const file of files) {
    if (file.kind !== "source") {
      continue;
    }
    counts[file.extension.replace(/^\./, "") || "unknown"] =
      (counts[file.extension.replace(/^\./, "") || "unknown"] ?? 0) + 1;
  }

  return counts;
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath).replaceAll("\\", "/").toLowerCase();
}
