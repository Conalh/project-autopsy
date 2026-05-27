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

function buildAbsoluteUrl(path: string, headers?: HeaderReader): string | undefined {
  const host = headers?.get("x-forwarded-host") ?? headers?.get("host");
  if (!host) {
    return undefined;
  }

  const proto = headers?.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}${path}`;
}
