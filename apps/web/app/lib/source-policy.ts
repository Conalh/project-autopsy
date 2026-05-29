import { isGitHubUrl } from "@project-autopsy/core";

interface HeaderReader {
  get(name: string): string | null;
}

type PolicyEnv = Record<string, string | undefined>;

export interface InspectAuthResult {
  configured: boolean;
  authorized: boolean;
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

/**
 * Hosted instances accept only public github.com URLs. Anything else is treated
 * as a local path and rejected unless local inspection has been explicitly
 * enabled for development.
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
 * Optional bearer/token gate for the inspect API, mirroring the admin-token
 * pattern. When PROJECT_AUTOPSY_INSPECT_TOKEN is unset the endpoint is open.
 */
export function evaluateInspectAuth(headers: HeaderReader, env: PolicyEnv = process.env): InspectAuthResult {
  const configuredToken = env.PROJECT_AUTOPSY_INSPECT_TOKEN?.trim();
  if (!configuredToken) {
    return { configured: false, authorized: true };
  }

  const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const headerToken = headers.get("x-project-autopsy-inspect-token")?.trim();
  const requestToken = bearer || headerToken || undefined;

  return { configured: true, authorized: requestToken === configuredToken };
}
