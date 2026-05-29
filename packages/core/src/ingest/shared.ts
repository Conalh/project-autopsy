import path from "node:path";
import type {
  DocRecord,
  FileKind,
  FileRecord,
  ManifestManager,
  ManifestRecord
} from "../types.js";

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

/**
 * Directory names that hold generated or vendored content. Manifests and docs
 * found inside these are ignored so a single `node_modules/.../package.json`
 * (committed by mistake) or a `dist/` copy never skews the analysis. The local
 * walker prunes most of these; GitHub trees can still contain them.
 */
export const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  ".tox",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor"
]);

// Read caps keep ingestion bounded on large or generated-heavy repositories and
// limit GitHub API rate-limit exposure.
export const MAX_MANIFEST_BYTES = 1024 * 1024;
export const MAX_DOC_BYTES = 512 * 1024;
export const MAX_TOTAL_DOC_BYTES = 4 * 1024 * 1024;
export const MAX_DOC_COUNT = 80;

export function isVendoredPath(filePath: string): boolean {
  return filePath
    .toLowerCase()
    .split("/")
    .some((segment) => IGNORED_DIRECTORIES.has(segment));
}

export function classifyFile(filePath: string): FileKind {
  const normalized = filePath.toLowerCase();
  const extension = path.extname(normalized);

  if (normalized.startsWith(".github/workflows/")) {
    return "workflow";
  }

  if (isTestPath(normalized)) {
    return "test";
  }

  if (normalized === "readme.md" || normalized.startsWith("docs/") || DOC_EXTENSIONS.has(extension)) {
    return "docs";
  }

  if (isManifestPath(normalized)) {
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

/**
 * Recognize tests across the common conventions of the ecosystems we ingest:
 * JS/TS (`*.test.*`, `*.spec.*`, `*.cy.*`, `__tests__/`, e2e/cypress dirs),
 * Python (`test_*.py`, `*_test.py`, `conftest.py`), Go (`*_test.go`), and
 * JVM/.NET (`*Test`, `*Tests`, `*Spec`). Path-only detection cannot see Rust
 * inline `#[cfg(test)]` modules, but `tests/` integration dirs are covered.
 */
function isTestPath(normalized: string): boolean {
  if (/(^|\/)(__tests__|__test__|tests?|e2e|cypress)\//.test(normalized)) {
    return true;
  }

  const base = path.basename(normalized);
  return (
    /\.(test|spec|cy)\.[cm]?[jt]sx?$/.test(base) ||
    /^test_.*\.py$/.test(base) ||
    /_test\.py$/.test(base) ||
    base === "conftest.py" ||
    /_test\.go$/.test(base) ||
    /(test|tests|spec)\.(java|kt)$/.test(base) ||
    /tests?\.cs$/.test(base)
  );
}

export function isDocPath(filePath: string): boolean {
  return DOC_EXTENSIONS.has(path.extname(filePath.toLowerCase()));
}

export function detectManifestManager(filePath: string): ManifestManager | undefined {
  const normalized = filePath.toLowerCase();

  if (normalized.startsWith(".github/workflows/")) return "github_actions";
  if (isVendoredPath(normalized)) return undefined;

  const base = path.basename(normalized);

  if (base === "package.json") return "npm";
  if (base === "pyproject.toml" || base === "requirements.txt") return "python";
  if (base === "cargo.toml") return "rust";
  if (base === "go.mod") return "go";
  if (base.endsWith(".csproj") || base.endsWith(".sln")) return "dotnet";
  if (
    base === "dockerfile" ||
    base === "compose.yaml" ||
    base === "compose.yml" ||
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml"
  ) {
    return "docker";
  }

  return undefined;
}

/**
 * Choose the manifests to actually read, skipping anything over the size cap so
 * a single huge file cannot blow up ingestion or rate limits.
 */
export function selectManifestTargets(
  files: FileRecord[]
): Array<{ file: FileRecord; manager: ManifestManager }> {
  const targets: Array<{ file: FileRecord; manager: ManifestManager }> = [];

  for (const file of files) {
    const manager = detectManifestManager(file.path);
    if (!manager) {
      continue;
    }
    if (file.sizeBytes > MAX_MANIFEST_BYTES) {
      continue;
    }
    targets.push({ file, manager });
  }

  return targets;
}

/**
 * Choose the docs to read: README first, vendored/oversized files skipped, and
 * bounded by per-file size, total bytes, and count. Returns the chosen files
 * plus how many eligible docs were dropped so callers can warn instead of
 * silently truncating.
 */
export function selectDocTargets(files: FileRecord[]): { files: FileRecord[]; skipped: number } {
  const eligible = files
    .filter((file) => file.kind === "docs" && isDocPath(file.path) && !isVendoredPath(file.path))
    .sort(
      (left, right) => scoreDocPath(left.path) - scoreDocPath(right.path) || left.path.localeCompare(right.path)
    );

  const selected: FileRecord[] = [];
  let totalBytes = 0;

  for (const file of eligible) {
    if (selected.length >= MAX_DOC_COUNT) {
      break;
    }
    if (file.sizeBytes > MAX_DOC_BYTES) {
      continue;
    }
    if (totalBytes + file.sizeBytes > MAX_TOTAL_DOC_BYTES) {
      break;
    }
    totalBytes += file.sizeBytes;
    selected.push(file);
  }

  return { files: selected, skipped: eligible.length - selected.length };
}

export function scoreDocPath(filePath: string): number {
  return filePath.toLowerCase() === "readme.md" ? 0 : 1;
}

export function parseManifest(pathName: string, manager: ManifestManager, content: string): ManifestRecord {
  try {
    if (manager === "npm") {
      return parseNpmManifest(pathName, content);
    }

    if (manager === "python") {
      return parsePythonManifest(pathName, content);
    }

    if (manager === "rust") {
      return parseCargoManifest(pathName, content);
    }

    if (manager === "go") {
      return parseGoManifest(pathName, content);
    }

    if (manager === "dotnet") {
      return parseDotnetManifest(pathName, content);
    }

    return {
      path: pathName,
      manager,
      parsed: { raw: content },
      scripts: {},
      dependencies: {},
      devDependencies: {}
    };
  } catch (error) {
    // A tool that analyzes broken/stale repos must not crash on a malformed
    // manifest. Degrade to an empty record and let detectors surface a finding.
    return {
      path: pathName,
      manager,
      parsed: { raw: content.slice(0, 500) },
      scripts: {},
      dependencies: {},
      devDependencies: {},
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseNpmManifest(pathName: string, content: string): ManifestRecord {
  const parsed = JSON.parse(content) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  return {
    path: pathName,
    manager: "npm",
    parsed: parsed as Record<string, unknown>,
    scripts: parsed.scripts ?? {},
    dependencies: parsed.dependencies ?? {},
    devDependencies: parsed.devDependencies ?? {}
  };
}

function parsePythonManifest(pathName: string, content: string): ManifestRecord {
  if (pathName.toLowerCase().endsWith("requirements.txt")) {
    return {
      path: pathName,
      manager: "python",
      parsed: { format: "requirements.txt" },
      scripts: {},
      dependencies: parseRequirementLines(content),
      devDependencies: {}
    };
  }

  const project = readTomlSection(content, "project");
  const scriptsSection = readTomlSection(content, "project.scripts");
  const optionalDependencies = readTomlSection(content, "project.optional-dependencies");

  return {
    path: pathName,
    manager: "python",
    parsed: {
      name: readTomlString(project, "name"),
      version: readTomlString(project, "version"),
      requiresPython: readTomlString(project, "requires-python")
    },
    scripts: readTomlStringMap(scriptsSection),
    dependencies: parseRequirementEntries(readTomlArray(project, "dependencies")),
    devDependencies: parseRequirementEntries(readTomlArrays(optionalDependencies).flatMap((entry) => entry.values))
  };
}

function parseCargoManifest(pathName: string, content: string): ManifestRecord {
  const cargoPackage = readTomlSection(content, "package");

  return {
    path: pathName,
    manager: "rust",
    parsed: {
      name: readTomlString(cargoPackage, "name"),
      version: readTomlString(cargoPackage, "version"),
      edition: readTomlString(cargoPackage, "edition")
    },
    scripts: {},
    dependencies: readCargoDependencies(readTomlSection(content, "dependencies")),
    devDependencies: readCargoDependencies(readTomlSection(content, "dev-dependencies"))
  };
}

function parseGoManifest(pathName: string, content: string): ManifestRecord {
  const lines = content.split(/\r?\n/);
  const dependencies: Record<string, string> = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripGoComment(lines[index] ?? "").trim();
    const singleRequire = line.match(/^require\s+(\S+)\s+(\S+)/);
    if (singleRequire?.[1] && singleRequire[2]) {
      dependencies[singleRequire[1]] = singleRequire[2];
      continue;
    }

    if (line === "require (") {
      index += 1;
      while (index < lines.length) {
        const blockLine = stripGoComment(lines[index] ?? "").trim();
        if (blockLine === ")") {
          break;
        }
        const blockRequire = blockLine.match(/^(\S+)\s+(\S+)/);
        if (blockRequire?.[1] && blockRequire[2]) {
          dependencies[blockRequire[1]] = blockRequire[2];
        }
        index += 1;
      }
    }
  }

  return {
    path: pathName,
    manager: "go",
    parsed: {
      module: lines.find((line) => line.startsWith("module "))?.replace(/^module\s+/, "").trim(),
      go: lines.find((line) => line.startsWith("go "))?.replace(/^go\s+/, "").trim()
    },
    scripts: {},
    dependencies,
    devDependencies: {}
  };
}

function parseDotnetManifest(pathName: string, content: string): ManifestRecord {
  const dependencies: Record<string, string> = {};

  for (const match of content.matchAll(/<PackageReference\b([^>]*)\/?>/gi)) {
    const attributes = match[1] ?? "";
    const name = readXmlAttribute(attributes, "Include") ?? readXmlAttribute(attributes, "Update");
    const version = readXmlAttribute(attributes, "Version") ?? "";
    if (name) {
      dependencies[name] = version;
    }
  }

  return {
    path: pathName,
    manager: "dotnet",
    parsed: {
      sdk: content.match(/<Project\b[^>]*\bSdk="([^"]+)"/i)?.[1],
      targetFramework: content.match(/<TargetFramework>([^<]+)<\/TargetFramework>/i)?.[1]
    },
    scripts: {},
    dependencies,
    devDependencies: {}
  };
}

export function createDocRecord(pathName: string, content: string): DocRecord {
  return {
    path: pathName,
    title: extractTitle(content),
    content
  };
}

export function summarizeProject(docs: DocRecord[], manifests: ManifestRecord[], fallbackName: string) {
  const readme = docs.find((doc) => doc.path.toLowerCase() === "readme.md");
  // Prefer a root-level manifest's name; nested workspace manifests should not
  // override the repository's identity now that they are discovered too.
  const namingManifest =
    manifests.find((manifest) => !manifest.path.includes("/") && manifest.parsed.name) ??
    manifests.find((manifest) => manifest.manager === "npm" && manifest.parsed.name);
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
    projectName: readme?.title ?? ((namingManifest?.parsed.name as string | undefined) ?? fallbackName),
    claimedValue: extractClaimedValue(readme?.content),
    technologies: [...technologies].sort()
  };
}

export function summarizeLanguages(files: FileRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const file of files) {
    if (file.kind !== "source") {
      continue;
    }
    const language = file.extension.replace(/^\./, "") || "unknown";
    counts[language] = (counts[language] ?? 0) + 1;
  }

  return counts;
}

function isManifestPath(normalizedPath: string): boolean {
  return (
    normalizedPath === "package.json" ||
    normalizedPath === "pyproject.toml" ||
    normalizedPath === "cargo.toml" ||
    normalizedPath === "go.mod" ||
    normalizedPath.endsWith(".csproj") ||
    normalizedPath.endsWith(".sln") ||
    normalizedPath.endsWith(".yml") ||
    normalizedPath.endsWith(".yaml") ||
    normalizedPath.endsWith(".json")
  );
}

function readTomlSection(content: string, sectionName: string): string[] {
  const lines = content.split(/\r?\n/);
  const sectionHeader = `[${sectionName}]`;
  const startIndex = lines.findIndex((line) => line.trim() === sectionHeader);
  if (startIndex === -1) {
    return [];
  }

  const sectionLines: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      break;
    }
    sectionLines.push(line);
  }

  return sectionLines;
}

function readTomlString(lines: string[], key: string): string | undefined {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`);
  return lines.map((line) => line.match(pattern)?.[1]).find((value): value is string => Boolean(value));
}

function readTomlStringMap(lines: string[]): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"\s*$/);
    if (match?.[1] && match[2] !== undefined) {
      values[match[1]] = match[2];
    }
  }

  return values;
}

function readTomlArray(lines: string[], key: string): string[] {
  const values: string[] = [];
  const startPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\[`);
  const startIndex = lines.findIndex((line) => startPattern.test(line));
  if (startIndex === -1) {
    return values;
  }

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const match of line.matchAll(/"([^"]+)"/g)) {
      if (match[1]) {
        values.push(match[1]);
      }
    }
    if (line.includes("]")) {
      break;
    }
  }

  return values;
}

function readTomlArrays(lines: string[]): Array<{ key: string; values: string[] }> {
  const arrays: Array<{ key: string; values: string[] }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*\[/);
    if (!match?.[1]) {
      continue;
    }
    arrays.push({ key: match[1], values: readTomlArray(lines.slice(index), match[1]) });
  }

  return arrays;
}

function parseRequirementLines(content: string): Record<string, string> {
  return parseRequirementEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+#.*$/, "").trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("-"))
  );
}

function parseRequirementEntries(entries: string[]): Record<string, string> {
  const dependencies: Record<string, string> = {};

  for (const entry of entries) {
    const withoutMarker = entry.split(";")[0]?.trim() ?? "";
    const match = withoutMarker.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(.*)$/);
    if (!match?.[1]) {
      continue;
    }
    dependencies[match[1]] = (match[2] ?? "").trim() || "*";
  }

  return dependencies;
}

function readCargoDependencies(lines: string[]): Record<string, string> {
  const dependencies: Record<string, string> = {};

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!match?.[1] || !match[2]) {
      continue;
    }

    const value = match[2].trim();
    dependencies[match[1]] =
      value.match(/^"([^"]+)"/)?.[1] ??
      value.match(/\bversion\s*=\s*"([^"]+)"/)?.[1] ??
      (value.includes("workspace") ? "workspace" : value);
  }

  return dependencies;
}

function stripGoComment(line: string): string {
  return line.replace(/\s+\/\/.*$/, "");
}

function readXmlAttribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(new RegExp(`\\b${escapeRegExp(name)}="([^"]+)"`, "i"));
  return match?.[1];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTitle(content: string): string | undefined {
  const titleLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  const title = titleLine?.replace(/^#\s+/, "").trim();
  return title ? stripMarkdownBadges(title) : undefined;
}

function stripMarkdownBadges(value: string): string {
  return value
    .replace(/\[!\[[^\]]*]\([^)]+\)]\([^)]+\)/g, "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
