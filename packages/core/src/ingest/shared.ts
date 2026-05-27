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

export function classifyFile(filePath: string): FileKind {
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

export function isDocPath(filePath: string): boolean {
  return DOC_EXTENSIONS.has(path.extname(filePath.toLowerCase()));
}

export function detectManifestManager(filePath: string): ManifestManager | undefined {
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

export function parseManifest(pathName: string, manager: ManifestManager, content: string): ManifestRecord {
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

export function createDocRecord(pathName: string, content: string): DocRecord {
  return {
    path: pathName,
    title: extractTitle(content),
    content
  };
}

export function summarizeProject(docs: DocRecord[], manifests: ManifestRecord[], fallbackName: string) {
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
    projectName: readme?.title ?? ((npmManifest?.parsed.name as string | undefined) ?? fallbackName),
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

function extractTitle(content: string): string | undefined {
  const titleLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  return titleLine?.replace(/^#\s+/, "").trim();
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
