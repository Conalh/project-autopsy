import path from "node:path";
import Link from "next/link";
import { analyzeAndSaveRepository, analyzeRepository } from "@project-autopsy/core";
import { createWebRunStore } from "../lib/run-store";
import { resolveGitHubToken } from "../lib/github-auth";
import { assertSourceAllowed } from "../lib/source-policy";
import { ReportView } from "./report-view";

export const dynamic = "force-dynamic";

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

    if (params.save === "1") {
      const saved = await analyzeAndSaveRepository(source, {
        branch: params.branch,
        checkDependencyRegistry: params.checkRegistry === "1",
        token,
        store: await createWebRunStore()
      });
      return <ReportView report={saved.report} savedRunId={saved.id} />;
    }

    const report = await analyzeRepository(source, {
      branch: params.branch,
      checkDependencyRegistry: params.checkRegistry === "1",
      token
    });
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
