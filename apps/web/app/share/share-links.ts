interface HeaderReader {
  get(name: string): string | null;
}

export interface ShareLinks {
  reportPath: string;
  markdownPath: string;
  reportUrl: string;
}

export function buildShareLinks(runId: string, headers?: HeaderReader): ShareLinks {
  const encodedRunId = encodeURIComponent(runId);
  const reportPath = `/share/${encodedRunId}`;
  const markdownPath = `/api/runs/${encodedRunId}/export.md`;

  return {
    reportPath,
    markdownPath,
    reportUrl: buildAbsoluteUrl(reportPath, headers) ?? reportPath
  };
}

type ShareLinkEnv = Record<string, string | undefined>;

function buildAbsoluteUrl(
  path: string,
  headers?: HeaderReader,
  env: ShareLinkEnv = process.env
): string | undefined {
  // Prefer an operator-configured canonical base URL. This is the only source
  // that is fully trusted.
  const publicUrl = env.PROJECT_AUTOPSY_PUBLIC_URL?.trim();
  if (publicUrl) {
    try {
      return new URL(path, ensureTrailingSlash(publicUrl)).toString();
    } catch {
      return undefined;
    }
  }

  // Otherwise only trust forwarded host/proto when the host is allow-listed, so
  // a poisoned Host header cannot produce a misleading share link. With no
  // allow-list configured we fall back to a relative path.
  const host = headers?.get("x-forwarded-host") ?? headers?.get("host");
  if (!host || !isAllowedHost(host, env)) {
    return undefined;
  }

  const proto = normalizeProto(headers?.get("x-forwarded-proto"));
  return `${proto}://${host}${path}`;
}

function isAllowedHost(host: string, env: ShareLinkEnv): boolean {
  const allowList = (env.PROJECT_AUTOPSY_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  if (allowList.length === 0) {
    return false;
  }

  return allowList.includes(host.trim().toLowerCase());
}

function normalizeProto(value: string | null | undefined): "http" | "https" {
  return value?.trim().toLowerCase() === "http" ? "http" : "https";
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
