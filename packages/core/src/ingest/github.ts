import path from "node:path";
import type {
  CommitSummary,
  FileRecord,
  InspectionBudgetOverrides,
  InspectionBudgets,
  IngestionCompleteness,
  ManifestCompleteness,
  ManifestRecord,
  HttpCompleteness,
  RepoSnapshot
} from "../types.js";
import {
  completenessStatus,
  createInspectionBudgetContext,
  getRemainingRuntimeMs,
  isRuntimeExpired,
  type InspectionBudgetContext,
  uniqueReasons
} from "./budgets.js";
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
  /** Reject private repositories before reading their tree or contents. */
  publicOnly?: boolean;
  branch?: string;
  checkDependencyRegistry?: boolean;
  npmRegistryFetch?: typeof fetch;
  pypiRegistryFetch?: typeof fetch;
  cratesRegistryFetch?: typeof fetch;
  budgets?: InspectionBudgetOverrides;
  budgetContext?: InspectionBudgetContext;
}

interface GitHubRepoResponse {
  name: string;
  full_name: string;
  html_url: string;
  description?: string | null;
  default_branch: string;
  private?: boolean;
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
  branchDiscoveryComplete: boolean;
  branchDiscoveryReason?: string;
}

interface GitHubRequester {
  request<T>(pathName: string, context?: { repoUrl?: string }): Promise<T>;
  http: HttpCompleteness;
}

interface GitHubFileInventory {
  files: FileRecord[];
  completeness: IngestionCompleteness["files"];
}

interface ManifestReadResult {
  manifests: ManifestRecord[];
  completeness: ManifestCompleteness;
}

interface GitHubPageResult<T> {
  values: T[];
  complete: boolean;
  reason?: string;
}

export class PrivateRepositoryNotAllowedError extends Error {
  constructor(repoUrl: string) {
    super(`Hosted inspection is limited to public GitHub repositories: ${repoUrl}`);
    this.name = "PrivateRepositoryNotAllowedError";
  }
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
  const budgetContext = options.budgetContext ?? createInspectionBudgetContext(options.budgets);
  const { budgets, startedAt } = budgetContext;
  const parsed = parseGitHubUrl(input.url);
  const requester = createGitHubRequester(options, budgetContext);
  const repo = await requester.request<GitHubRepoResponse>(`/repos/${parsed.owner}/${parsed.repo}`, {
    repoUrl: parsed.url
  });
  if (options.publicOnly && repo.private !== false) {
    throw new PrivateRepositoryNotAllowedError(parsed.url);
  }
  const { branch, treeRef, branchDiscoveryComplete, branchDiscoveryReason } = await resolveBranch(
    requester.request,
    parsed,
    input.branch ?? parsed.branch,
    repo.default_branch,
    budgets
  );
  const tree = await requester.request<GitHubTreeResponse>(
    `/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(treeRef)}?recursive=1`
  );

  const inventory = buildGitHubFileInventory(
    tree,
    budgets,
    branchDiscoveryComplete ? [] : [branchDiscoveryReason ?? "github-branch-discovery-incomplete"]
  );
  const files = inventory.files;

  const manifestResult = await readGitHubManifests(requester.request, parsed, treeRef, files, budgets);
  const manifests = manifestResult.manifests;
  const docResult = await readGitHubDocs(requester.request, parsed, treeRef, files, budgets);
  const docs = docResult.docs;
  const commitResult = await readGitHubCommits(requester.request, parsed, treeRef, budgets.maxCommits);
  const commits = commitResult.commits;
  const summary = summarizeProject(docs, manifests, repo.name);
  const elapsedMs = Date.now() - startedAt;
  const runtimeTimedOut = isRuntimeExpired(budgetContext);
  const completeness: IngestionCompleteness = {
    files: inventory.completeness,
    manifests: manifestResult.completeness,
    docs: docResult.completeness,
    commits: {
      status: completenessStatus(commitResult.skipped, commitResult.reasons),
      requested: budgets.maxCommits,
      read: commits.length,
      skipped: commitResult.skipped,
      reasons: commitResult.reasons
    },
    http: requester.http,
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
    completeness,
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
  defaultBranch: string,
  budgets: InspectionBudgets
): Promise<ResolvedBranch> {
  const ref = candidate ?? defaultBranch;
  if (!ref.includes("/")) {
    return { branch: ref, treeRef: ref, branchDiscoveryComplete: true };
  }

  try {
    const branchPages = await readGitHubPages<GitHubBranchResponse>(
      request,
      `/repos/${repo.owner}/${repo.repo}/branches`,
      budgets
    );
    const match = branchPages.values
      .filter((entry) => ref === entry.name || ref.startsWith(`${entry.name}/`))
      .sort((left, right) => right.name.length - left.name.length)[0];

    if (match?.commit?.sha) {
      return { branch: match.name, treeRef: match.commit.sha, branchDiscoveryComplete: branchPages.complete };
    }

    if (!branchPages.complete) {
      return {
        branch: ref,
        treeRef: ref,
        branchDiscoveryComplete: false,
        branchDiscoveryReason: branchPages.reason ?? "github-branch-discovery-incomplete"
      };
    }
  } catch {
    return {
      branch: ref,
      treeRef: ref,
      branchDiscoveryComplete: false,
      branchDiscoveryReason: "github-branch-discovery-failed"
    };
  }

  return { branch: ref, treeRef: ref, branchDiscoveryComplete: true };
}

async function readGitHubPages<T>(
  request: <R>(pathName: string) => Promise<R>,
  pathName: string,
  budgets: InspectionBudgets
): Promise<GitHubPageResult<T>> {
  const perPage = 100;
  const values: T[] = [];
  const maxPages = Math.max(1, budgets.maxHttpRequests - 2);

  for (let page = 1; page <= maxPages; page += 1) {
    const separator = pathName.includes("?") ? "&" : "?";
    const batch = await request<T[]>(`${pathName}${separator}per_page=${perPage}&page=${page}`);
    values.push(...batch);
    if (batch.length < perPage) {
      return { values, complete: true };
    }
  }

  return { values, complete: false, reason: "github-branch-discovery-incomplete" };
}

function buildGitHubFileInventory(
  tree: GitHubTreeResponse,
  budgets: InspectionBudgets,
  extraReasons: string[] = []
): GitHubFileInventory {
  const files: FileRecord[] = [];
  let skipped = 0;
  let totalBytes = 0;
  const reasons: string[] = [];

  const blobs = tree.tree
    .filter((item) => item.type === "blob")
    .sort((left, right) => left.path.localeCompare(right.path));

  for (const item of blobs) {
    const sizeBytes = item.size ?? 0;
    if (files.length >= budgets.maxFiles) {
      skipped += 1;
      reasons.push("file-count-limit");
      continue;
    }
    if (totalBytes + sizeBytes > budgets.maxTotalBytes) {
      skipped += 1;
      reasons.push("total-byte-limit");
      continue;
    }

    files.push({
      path: item.path,
      extension: path.extname(item.path).toLowerCase(),
      sizeBytes,
      kind: classifyFile(item.path)
    });
    totalBytes += sizeBytes;
  }

  reasons.push(...extraReasons);

  if (tree.truncated) {
    reasons.push("github-tree-truncated");
  }

  return {
    files,
    completeness: {
      status: completenessStatus(skipped, reasons),
      discovered: blobs.length,
      included: files.length,
      skipped,
      reasons: uniqueReasons(reasons)
    }
  };
}

async function readGitHubManifests(
  request: <T>(pathName: string) => Promise<T>,
  repo: ParsedGitHubUrl,
  branch: string,
  files: FileRecord[],
  budgets: InspectionBudgets
): Promise<ManifestReadResult> {
  const selection = selectManifestTargets(files, budgets);
  let failed = 0;

  const manifests = await mapWithConcurrency(selection.targets, budgets.concurrency, async ({ file, manager }) => {
    try {
      const content = await readGitHubFile(request, repo, branch, file.path);
      return parseManifest(file.path, manager, content);
    } catch (error) {
      // A single unreadable manifest should become a finding, not abort the run.
      failed += 1;
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

async function readGitHubDocs(
  request: <T>(pathName: string) => Promise<T>,
  repo: ParsedGitHubUrl,
  branch: string,
  files: FileRecord[],
  budgets: InspectionBudgets
): Promise<{ docs: ReturnType<typeof createDocRecord>[]; completeness: IngestionCompleteness["docs"] }> {
  const selection = selectDocTargets(files, budgets);
  const docFiles = selection.files;
  let failed = 0;

  const docs = await mapWithConcurrency(docFiles, budgets.concurrency, async (file) => {
    try {
      const content = await readGitHubFile(request, repo, branch, file.path);
      return createDocRecord(file.path, content);
    } catch {
      failed += 1;
      return undefined;
    }
  });

  const readable = docs.filter((doc): doc is NonNullable<typeof doc> => doc !== undefined);
  const reasons = uniqueReasons([...selection.reasons, ...(failed > 0 ? ["doc-read-failed"] : [])]);
  return {
    docs: readable,
    completeness: {
      status: completenessStatus(selection.skipped + failed, reasons),
      discovered: selection.discovered,
      read: readable.length,
      skipped: selection.skipped,
      oversized: selection.oversized,
      failed,
      reasons
    }
  };
}

async function readGitHubCommits(
  request: <T>(pathName: string) => Promise<T>,
  repo: ParsedGitHubUrl,
  branch: string,
  maxCommits: number
): Promise<{ commits: CommitSummary[]; skipped: number; reasons: string[] }> {
  try {
    const commits = await request<GitHubCommitResponse[]>(
      `/repos/${repo.owner}/${repo.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${maxCommits}`
    );

    return {
      commits: commits.map((commit) => ({
        sha: commit.sha,
        authorName: commit.commit.author?.name ?? "Unknown",
        committedAt: commit.commit.author?.date ?? "",
        message: firstCommitLine(commit.commit.message ?? "")
      })),
      skipped: 0,
      reasons: []
    };
  } catch {
    return {
      commits: [],
      skipped: 1,
      reasons: ["commit-read-failed"]
    };
  }
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

function createGitHubRequester(
  options: GitHubInspectionOptions,
  budgetContext: InspectionBudgetContext
): GitHubRequester {
  const { budgets } = budgetContext;
  const fetchImpl = options.fetch ?? fetch;
  const reasons: string[] = [];
  const http: HttpCompleteness = {
    status: "complete",
    requestsMade: 0,
    responsesTooLarge: 0,
    failures: 0,
    limitReached: false,
    reasons
  };

  async function request<T>(
    pathName: string,
    context: { repoUrl?: string } = {}
  ): Promise<T> {
    if (isRuntimeExpired(budgetContext)) {
      markHttpPartial(http, "runtime-limit");
      throw new Error("GitHub runtime budget exhausted");
    }

    if (http.requestsMade >= budgets.maxHttpRequests) {
      http.limitReached = true;
      markHttpPartial(http, "http-request-limit");
      throw new Error("GitHub HTTP request budget exhausted");
    }

    http.requestsMade += 1;
    try {
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
        Math.min(budgets.fetchTimeoutMs, getRemainingRuntimeMs(budgetContext))
      );

      if (!response.ok) {
        http.failures += 1;
        markHttpPartial(http, "http-request-failed");
        if (response.status === 404 && context.repoUrl) {
          throw new Error(
            `GitHub repository not found or private: ${context.repoUrl}. Provide a GitHub token to inspect private repositories.`
          );
        }
        throw new Error(`GitHub API request failed (${response.status}) for ${pathName}`);
      }

      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (contentLength > budgets.maxResponseBytes) {
        throw new Error(`GitHub API response exceeded ${budgets.maxResponseBytes} bytes for ${pathName}`);
      }

      const text = await readResponseTextWithLimit(response, budgets.maxResponseBytes, pathName);

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof Error && error.message.includes("response exceeded")) {
        http.responsesTooLarge += 1;
        markHttpPartial(http, "response-byte-limit");
      } else if (!(error instanceof Error) || !/GitHub API request failed|repository not found/.test(error.message)) {
        http.failures += 1;
        markHttpPartial(http, "http-request-failed");
      }
      throw error;
    }
  }

  return { request, http };
}

async function readResponseTextWithLimit(response: Response, maxBytes: number, pathName: string): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error(`GitHub API response exceeded ${maxBytes} bytes for ${pathName}`);
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new Error(`GitHub API response exceeded ${maxBytes} bytes for ${pathName}`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

function firstCommitLine(message: string): string {
  return message.split(/\r?\n/)[0]?.trim() ?? "";
}

function markHttpPartial(http: HttpCompleteness, reason: string): void {
  http.status = "partial";
  http.reasons = uniqueReasons([...http.reasons, reason]);
}

function createIngestionWarnings(completeness: IngestionCompleteness): string[] {
  const warnings: string[] = [];

  if (completeness.files.status === "partial") {
    const treeReason = completeness.files.reasons.includes("github-tree-truncated")
      ? " GitHub returned a truncated file tree."
      : "";
    warnings.push(
      `Repository file inventory was incomplete:${treeReason} ${completeness.files.skipped} item(s) were skipped (${completeness.files.reasons.join(", ")}). Missing-file, missing-test, and dependency conclusions are provisional.`
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

  if (completeness.commits.status === "partial") {
    warnings.push(
      `Commit ingestion was incomplete: ${completeness.commits.skipped} commit request(s) failed (${completeness.commits.reasons.join(", ")}). Momentum conclusions are provisional.`
    );
  }

  if (completeness.http?.status === "partial") {
    warnings.push(
      `GitHub API ingestion was incomplete: ${completeness.http.failures} request(s) failed, ${completeness.http.responsesTooLarge} response(s) exceeded size limits, and request budget exhausted=${completeness.http.limitReached} (${completeness.http.reasons.join(", ")}). Conclusions are provisional.`
    );
  }

  if (completeness.runtime.status === "partial") {
    warnings.push(
      `Repository ingestion exceeded the runtime budget after ${completeness.runtime.elapsedMs}ms (${completeness.runtime.reasons.join(", ")}). Conclusions are provisional.`
    );
  }

  return warnings;
}
