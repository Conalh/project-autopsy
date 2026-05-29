import path from "node:path";
import type {
  CommitSummary,
  FileRecord,
  ManifestRecord,
  RepoSnapshot
} from "../types.js";
import {
  classifyFile,
  createDocRecord,
  parseManifest,
  selectDocTargets,
  selectManifestTargets,
  summarizeLanguages,
  summarizeProject
} from "./shared.js";
import { fetchWithTimeout, mapWithConcurrency } from "../util/async.js";

const GITHUB_READ_CONCURRENCY = 6;
const GITHUB_FETCH_TIMEOUT_MS = 15000;

export interface GitHubRepositoryInput {
  url: string;
  branch?: string;
}

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  url: string;
  branch?: string;
}

export interface GitHubInspectionOptions {
  fetch?: typeof fetch;
  token?: string;
  branch?: string;
  checkDependencyRegistry?: boolean;
  npmRegistryFetch?: typeof fetch;
  pypiRegistryFetch?: typeof fetch;
  cratesRegistryFetch?: typeof fetch;
}

interface GitHubRepoResponse {
  name: string;
  full_name: string;
  html_url: string;
  description?: string | null;
  default_branch: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  pushed_at?: string | null;
}

interface GitHubTreeResponse {
  sha: string;
  truncated?: boolean;
  tree: Array<{
    path: string;
    type: "blob" | "tree" | "commit";
    size?: number;
    sha?: string;
  }>;
}

interface GitHubContentResponse {
  path: string;
  encoding?: string;
  content?: string;
}

interface GitHubCommitResponse {
  sha: string;
  commit: {
    author?: {
      name?: string;
      date?: string;
    };
    message?: string;
  };
}

interface GitHubBranchResponse {
  name: string;
  commit?: { sha?: string };
}

interface ResolvedBranch {
  /** The branch name to report and to query commits with. */
  branch: string;
  /** A commit sha to fetch the tree with when the ref contained a slash. */
  treeRef: string;
}

export function parseGitHubUrl(value: string): ParsedGitHubUrl {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid GitHub URL: ${value}`);
  }

  if (parsed.hostname.toLowerCase() !== "github.com") {
    throw new Error(`Expected a github.com URL: ${value}`);
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  const owner = parts[0];
  const rawRepo = parts[1];

  if (!owner || !rawRepo) {
    throw new Error(`GitHub URL must include owner and repo: ${value}`);
  }

  const repo = rawRepo.replace(/\.git$/i, "");
  // A `/tree/<ref>` URL can carry a slash-containing branch (e.g. `feature/foo`)
  // and/or a trailing sub-path. Capture everything after `tree` as the raw ref;
  // the ingester disambiguates branch vs. path against the branches API.
  const branch =
    parts[2] === "tree" && parts.length > 3
      ? parts
          .slice(3)
          .map((segment) => decodeURIComponent(segment))
          .join("/")
      : undefined;

  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    branch
  };
}

export function isGitHubUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

export async function inspectGitHubRepository(
  input: GitHubRepositoryInput,
  options: GitHubInspectionOptions = {}
): Promise<RepoSnapshot> {
  const parsed = parseGitHubUrl(input.url);
  const request = createGitHubRequester(options);
  const repo = await request<GitHubRepoResponse>(`/repos/${parsed.owner}/${parsed.repo}`, {
    repoUrl: parsed.url
  });
  const { branch, treeRef } = await resolveBranch(
    request,
    parsed,
    input.branch ?? parsed.branch,
    repo.default_branch
  );
  const tree = await request<GitHubTreeResponse>(
    `/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(treeRef)}?recursive=1`
  );

  const ingestionWarnings: string[] = [];
  if (tree.truncated) {
    ingestionWarnings.push(
      "GitHub returned a truncated file tree for this repository, so the report is built from an incomplete file list. Missing-file, missing-test, and dependency conclusions may be wrong."
    );
  }

  const files = tree.tree
    .filter((item) => item.type === "blob")
    .map<FileRecord>((item) => ({
      path: item.path,
      extension: path.extname(item.path).toLowerCase(),
      sizeBytes: item.size ?? 0,
      kind: classifyFile(item.path)
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const manifests = await readGitHubManifests(request, parsed, treeRef, files);
  const { docs, skipped } = await readGitHubDocs(request, parsed, treeRef, files);
  if (skipped > 0) {
    ingestionWarnings.push(
      `${skipped} documentation file(s) were skipped by size/count limits and were not analyzed.`
    );
  }
  const commits = await readGitHubCommits(request, parsed, treeRef);
  const summary = summarizeProject(docs, manifests, repo.name);

  return {
    sourceType: "github_url",
    rootPath: parsed.url,
    owner: parsed.owner,
    repo: parsed.repo,
    url: parsed.url,
    defaultBranch: branch,
    headSha: commits[0]?.sha,
    fileCount: files.length,
    totalSizeBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
    languages: summarizeLanguages(files),
    files,
    manifests,
    docs,
    commits,
    summary,
    ...(ingestionWarnings.length > 0 ? { ingestionWarnings } : {})
  };
}

/**
 * Disambiguate the ref parsed from a `/tree/<ref>` URL. Simple refs (no slash)
 * are used as-is. A slash-containing ref is ambiguous between a branch with a
 * slash and a branch plus sub-path, so we consult the branches API and pick the
 * longest branch name that matches, fetching the tree by that branch's sha.
 */
async function resolveBranch(
  request: <T>(pathName: string) => Promise<T>,
  repo: ParsedGitHubUrl,
  candidate: string | undefined,
  defaultBranch: string
): Promise<ResolvedBranch> {
  const ref = candidate ?? defaultBranch;
  if (!ref.includes("/")) {
    return { branch: ref, treeRef: ref };
  }

  try {
    const branches = await request<GitHubBranchResponse[]>(
      `/repos/${repo.owner}/${repo.repo}/branches?per_page=100`
    );
    const match = branches
      .filter((entry) => ref === entry.name || ref.startsWith(`${entry.name}/`))
      .sort((left, right) => right.name.length - left.name.length)[0];

    if (match?.commit?.sha) {
      return { branch: match.name, treeRef: match.commit.sha };
    }
  } catch {
    // Fall through to a best-effort attempt with the raw ref.
  }

  return { branch: ref, treeRef: ref };
}

async function readGitHubManifests(
  request: <T>(pathName: string) => Promise<T>,
  repo: ParsedGitHubUrl,
  branch: string,
  files: FileRecord[]
): Promise<ManifestRecord[]> {
  const targets = selectManifestTargets(files);

  return mapWithConcurrency(targets, GITHUB_READ_CONCURRENCY, async ({ file, manager }) => {
    try {
      const content = await readGitHubFile(request, repo, branch, file.path);
      return parseManifest(file.path, manager, content);
    } catch (error) {
      // A single unreadable manifest should become a finding, not abort the run.
      return {
        path: file.path,
        manager,
        parsed: {},
        scripts: {},
        dependencies: {},
        devDependencies: {},
        parseError: error instanceof Error ? error.message : String(error)
      } satisfies ManifestRecord;
    }
  });
}

async function readGitHubDocs(
  request: <T>(pathName: string) => Promise<T>,
  repo: ParsedGitHubUrl,
  branch: string,
  files: FileRecord[]
): Promise<{ docs: ReturnType<typeof createDocRecord>[]; skipped: number }> {
  const { files: docFiles, skipped } = selectDocTargets(files);

  const docs = await mapWithConcurrency(docFiles, GITHUB_READ_CONCURRENCY, async (file) => {
    try {
      const content = await readGitHubFile(request, repo, branch, file.path);
      return createDocRecord(file.path, content);
    } catch {
      return undefined;
    }
  });

  const readable = docs.filter((doc): doc is NonNullable<typeof doc> => doc !== undefined);
  return { docs: readable, skipped: skipped + (docs.length - readable.length) };
}

async function readGitHubCommits(
  request: <T>(pathName: string) => Promise<T>,
  repo: ParsedGitHubUrl,
  branch: string
): Promise<CommitSummary[]> {
  const commits = await request<GitHubCommitResponse[]>(
    `/repos/${repo.owner}/${repo.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=20`
  );

  return commits.map((commit) => ({
    sha: commit.sha,
    authorName: commit.commit.author?.name ?? "Unknown",
    committedAt: commit.commit.author?.date ?? "",
    message: firstCommitLine(commit.commit.message ?? "")
  }));
}

async function readGitHubFile(
  request: <T>(pathName: string) => Promise<T>,
  repo: ParsedGitHubUrl,
  branch: string,
  filePath: string
): Promise<string> {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const content = await request<GitHubContentResponse>(
    `/repos/${repo.owner}/${repo.repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`
  );

  if (content.encoding !== "base64" || !content.content) {
    throw new Error(`GitHub content API did not return Base64 content for ${filePath}`);
  }

  return Buffer.from(content.content.replace(/\s/g, ""), "base64").toString("utf8");
}

function createGitHubRequester(options: GitHubInspectionOptions) {
  const fetchImpl = options.fetch ?? fetch;

  return async function request<T>(
    pathName: string,
    context: { repoUrl?: string } = {}
  ): Promise<T> {
    const response = await fetchWithTimeout(
      fetchImpl,
      `https://api.github.com${pathName}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "project-autopsy",
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
        }
      },
      GITHUB_FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      if (response.status === 404 && context.repoUrl) {
        throw new Error(
          `GitHub repository not found or private: ${context.repoUrl}. Provide a GitHub token to inspect private repositories.`
        );
      }
      throw new Error(`GitHub API request failed (${response.status}) for ${pathName}`);
    }

    return (await response.json()) as T;
  };
}

function firstCommitLine(message: string): string {
  return message.split(/\r?\n/)[0]?.trim() ?? "";
}
