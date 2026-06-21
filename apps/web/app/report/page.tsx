import path from "node:path";
import { headers } from "next/headers";
import Link from "next/link";
import {
  analyzeRepository,
  createExternalAutopsyReport,
  renderJsonReport,
  renderMarkdownReport
} from "@project-autopsy/core";
import { AccessRequired } from "../lib/access-ui";
import { clientKeyFromHeaders, createInspectRateLimiter } from "../lib/inspect-rate-limit";
import { createWebRunStore } from "../lib/run-store";
import { resolveGitHubToken } from "../lib/github-auth";
import {
  assertSourceAllowed,
  evaluateInspectAuth,
  inspectAuthFailureMessage
} from "../lib/source-policy";
import { ReportView } from "./report-view";

export const dynamic = "force-dynamic";

const reportRateLimiter = createInspectRateLimiter();

interface ReportPageProps {
  searchParams: Promise<{
    source?: string;
    branch?: string;
    demo?: string;
    save?: string;
    checkRegistry?: string;
  }>;
}

export default async function ReportPage({ searchParams }: ReportPageProps) {
  const requestHeaders = await headers();
  const auth = evaluateInspectAuth(requestHeaders);
  if (!auth.authorized) {
    return (
      <AccessRequired
        title="Inspection access required"
        message={inspectAuthFailureMessage(auth)}
      />
    );
  }

  const rate = reportRateLimiter.check(clientKeyFromHeaders(requestHeaders));
  if (!rate.allowed) {
    return (
      <AccessRequired
        title="Inspection rate limit reached"
        message={`Too many inspection requests. Try again in ${rate.retryAfterSeconds} seconds.`}
      />
    );
  }

  const params = await searchParams;
  const resolved = resolveSource(params);

  if (!resolved) {
    return (
      <main className="shell">
        <p className="eyebrow">Project Autopsy</p>
        <h1>No repository selected</h1>
        <p className="muted">Enter a public GitHub URL or open the fixture demo.</p>
        <Link className="action-link" href="/">
          Back to inspector
        </Link>
      </main>
    );
  }

  try {
    // Fixture demos resolve to a known local path server-side; any caller-
    // supplied source must pass the hosted source policy (GitHub-only by default).
    if (!resolved.trusted) {
      assertSourceAllowed(resolved.source);
    }

    const source = resolved.source;
    const token = await resolveGitHubToken();
    const report = createExternalAutopsyReport(
      await analyzeRepository(source, {
        branch: params.branch,
        checkDependencyRegistry: params.checkRegistry === "1",
        token
      })
    );

    if (params.save === "1") {
      const saved = await (await createWebRunStore()).saveRun({
        source,
        report,
        markdown: renderMarkdownReport(report),
        json: renderJsonReport(report)
      });
      return <ReportView report={saved.report} savedRunId={saved.id} />;
    }

    return <ReportView report={report} />;
  } catch (error) {
    return (
      <main className="shell">
        <p className="eyebrow">Project Autopsy</p>
        <h1>Inspection failed</h1>
        <p className="error-text">{error instanceof Error ? error.message : String(error)}</p>
        <Link className="action-link" href="/">
          Back to inspector
        </Link>
      </main>
    );
  }
}

function resolveSource(
  params: { source?: string; demo?: string }
): { source: string; trusted: boolean } | undefined {
  if (params.demo === "fixture") {
    return { source: path.resolve(process.cwd(), "../../fixtures/stalled-npm-app"), trusted: true };
  }

  if (params.source) {
    return { source: params.source, trusted: false };
  }

  return undefined;
}
