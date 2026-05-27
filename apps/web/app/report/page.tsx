import path from "node:path";
import Link from "next/link";
import { analyzeAndSaveRepository, analyzeRepository } from "@project-autopsy/core";
import { createWebRunStore } from "../lib/run-store";
import { resolveGitHubToken } from "../lib/github-auth";
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
  const source = resolveSource(params);

  if (!source) {
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

function resolveSource(params: { source?: string; demo?: string }) {
  if (params.demo === "fixture") {
    return path.resolve(process.cwd(), "../../fixtures/stalled-npm-app");
  }

  return params.source;
}
