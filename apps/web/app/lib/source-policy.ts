import {
  DEFAULT_INGESTION_BUDGETS,
  isGitHubUrl,
  type InspectionBudgetOverrides,
  type InspectionBudgets
} from "@project-autopsy/core";
import { verifySecretToken } from "./secure-token";

interface HeaderReader {
  get(name: string): string | null;
}

type PolicyEnv = Record<string, string | undefined>;

export interface InspectAuthResult {
  configured: boolean;
  required: boolean;
  authorized: boolean;
  missingConfiguration?: boolean;
}

/**
 * Thrown when a deployment is asked to inspect a source it is not allowed to,
 * e.g. a local filesystem path on a hosted instance. Routes map this to 403.
 */
export class SourceNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceNotAllowedError";
  }
}

/**
 * Local filesystem inspection lets a caller read arbitrary server paths, so it
 * is off by default and only enabled for local development via an explicit flag.
 */
export function isLocalPathInspectionAllowed(env: PolicyEnv = process.env): boolean {
  return env.PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS?.trim().toLowerCase() === "true";
}

export function hasPrivateRepositoryCredentialsConfigured(env: PolicyEnv = process.env): boolean {
  if (readEnv(env, "PROJECT_AUTOPSY_GITHUB_TOKEN")) {
    return true;
  }

  const appId = readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_ID");
  const appPrivateKey =
    readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY") ??
    readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH");

  return Boolean(appId && appPrivateKey);
}

export function isHostedRuntime(env: PolicyEnv = process.env): boolean {
  return readEnv(env, "NODE_ENV") === "production";
}

export function isInspectAuthRequired(env: PolicyEnv = process.env): boolean {
  return Boolean(readEnv(env, "PROJECT_AUTOPSY_INSPECT_TOKEN"));
}

/**
 * Private hosted inspection is deliberately double opt-in: the deployment
 * must enable it and must gate inspection requests with an access token.
 */
export function isPrivateRepositoryInspectionAllowed(env: PolicyEnv = process.env): boolean {
  const enabled = env.PROJECT_AUTOPSY_ALLOW_PRIVATE_REPOSITORIES?.trim().toLowerCase() === "true";
  const accessToken = env.PROJECT_AUTOPSY_INSPECT_TOKEN?.trim();
  return enabled && Boolean(accessToken);
}

/**
 * Hosted instances accept GitHub URLs. The analysis core separately enforces
 * public-only access unless private hosted inspection is double opted-in.
 */
export function assertSourceAllowed(source: string, env: PolicyEnv = process.env): void {
  if (isGitHubUrl(source)) {
    return;
  }

  if (isLocalPathInspectionAllowed(env)) {
    return;
  }

  throw new SourceNotAllowedError(
    "This deployment only inspects public github.com URLs. Local filesystem paths are disabled. Set PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS=true to enable them in local development."
  );
}

/**
 * Optional bearer/header token gate for inspection and saved-report surfaces.
 * Public-repository demos remain open until an operator configures a token;
 * private hosted inspection separately requires that token as a double opt-in.
 */
export function evaluateInspectAuth(headers: HeaderReader, env: PolicyEnv = process.env): InspectAuthResult {
  const configuredToken = env.PROJECT_AUTOPSY_INSPECT_TOKEN?.trim();
  const required = isInspectAuthRequired(env);

  if (!configuredToken) {
    return required
      ? { configured: false, required, authorized: false, missingConfiguration: true }
      : { configured: false, required, authorized: true };
  }

  const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const headerToken = headers.get("x-project-autopsy-inspect-token")?.trim();
  const requestToken = bearer || headerToken || undefined;

  return { configured: true, required: true, authorized: verifySecretToken(requestToken, configuredToken) };
}

export function inspectAuthFailureStatus(auth: InspectAuthResult): number {
  return auth.missingConfiguration ? 503 : 401;
}

export function inspectAuthFailureMessage(auth: InspectAuthResult): string {
  if (auth.missingConfiguration) {
    return "PROJECT_AUTOPSY_INSPECT_TOKEN is required when hosted inspection access is protected.";
  }

  return "Unauthorized.";
}

const BUDGET_ENV_NAMES: Record<keyof InspectionBudgets, string> = {
  maxFiles: "PROJECT_AUTOPSY_MAX_FILES",
  maxDepth: "PROJECT_AUTOPSY_MAX_DEPTH",
  maxTotalBytes: "PROJECT_AUTOPSY_MAX_TOTAL_BYTES",
  maxManifests: "PROJECT_AUTOPSY_MAX_MANIFESTS",
  maxManifestBytes: "PROJECT_AUTOPSY_MAX_MANIFEST_BYTES",
  maxDocs: "PROJECT_AUTOPSY_MAX_DOCS",
  maxDocBytes: "PROJECT_AUTOPSY_MAX_DOC_BYTES",
  maxTotalDocBytes: "PROJECT_AUTOPSY_MAX_TOTAL_DOC_BYTES",
  maxCommits: "PROJECT_AUTOPSY_MAX_COMMITS",
  maxHttpRequests: "PROJECT_AUTOPSY_MAX_HTTP_REQUESTS",
  maxResponseBytes: "PROJECT_AUTOPSY_MAX_RESPONSE_BYTES",
  concurrency: "PROJECT_AUTOPSY_INGEST_CONCURRENCY",
  registryConcurrency: "PROJECT_AUTOPSY_REGISTRY_CONCURRENCY",
  maxRuntimeMs: "PROJECT_AUTOPSY_MAX_RUNTIME_MS",
  fetchTimeoutMs: "PROJECT_AUTOPSY_FETCH_TIMEOUT_MS"
};

export function readHostedInspectionBudgets(env: PolicyEnv = process.env): InspectionBudgetOverrides {
  const configured: Partial<Record<keyof InspectionBudgets, unknown>> = {};

  for (const [key, envName] of Object.entries(BUDGET_ENV_NAMES) as Array<[keyof InspectionBudgets, string]>) {
    configured[key] = readPositiveInteger(env, envName);
  }

  return clampInspectionBudgets(configured);
}

export function clampInspectionBudgets(input: Partial<Record<keyof InspectionBudgets, unknown>>): InspectionBudgetOverrides {
  const budgets: InspectionBudgetOverrides = {};

  for (const key of Object.keys(DEFAULT_INGESTION_BUDGETS) as Array<keyof InspectionBudgets>) {
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    budgets[key] = Math.min(Math.floor(value), DEFAULT_INGESTION_BUDGETS[key]);
  }
  return budgets;
}

function readEnv(env: PolicyEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readPositiveInteger(env: PolicyEnv, name: string): number | undefined {
  const raw = readEnv(env, name);
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}
