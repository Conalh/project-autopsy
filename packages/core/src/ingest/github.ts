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
  detectManifestManager,
  isDocPath,
  parseManifest,
  summarizeLanguages,
  summarizeProject
} from "./shared.js";

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
  const branch = parts[2] === "tree" ? parts[3] : undefined;

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
  const branch = input.branch ?? parsed.branch ?? repo.default_branch;
  const tree = await request<GitHubTreeResponse>(
    `/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );

  const files = tree.tree
    .filter((item) => item.type === "blob")
    .map<FileRecord>((item) => ({
      path: item.path,
      extension: path.extname(item.path).toLowerCase(),
      sizeBytes: item.size ?? 0,
      kind: classifyFile(item.path)
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const manifests = await readGitHubManifests(request, parsed, branch, files);
  const docs = await readGitHubDocs(request, parsed, branch, files);
  const commits = await readGitHubCommits(request, parsed, branch);
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
    summary
  };
}

async function readGitHubManifests(
  request: <T>(pathName: string) => Promise<T>,
  repo: ParsedGitHubUrl,
  branch: string,
  files: FileRecord[]
): Promise<ManifestRecord[]> {
  const manifests: ManifestRecord[] = [];

  for (const file of files) {
    const manager = detectManifestManager(file.path);
    if (!manager) {
      continue;
    }

    const content = await readGitHubFile(request, repo, branch, file.path);
    manifests.push(parseManifest(file.path, manager, content));
  }

  return manifests;
}

async function readGitHubDocs(
  request: <T>(pathName: string) => Promise<T>,
  repo: ParsedGitHubUrl,
  branch: string,
  files: FileRecord[]
) {
  const docs = [];
  const docFiles = files
    .filter((file) => file.kind === "docs" && isDocPath(file.path))
    .sort((left, right) => scoreDocPath(left.path) - scoreDocPath(right.path) || left.path.localeCompare(right.path));

  for (const file of docFiles) {
    const content = await readGitHubFile(request, repo, branch, file.path);
    docs.push(createDocRecord(file.path, content));
  }

  return docs;
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
    const response = await fetchImpl(`https://api.github.com${pathName}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "project-autopsy",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
      }
    });

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

function scoreDocPath(filePath: string): number {
  return filePath.toLowerCase() === "readme.md" ? 0 : 1;
}
