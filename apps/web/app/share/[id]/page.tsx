import { headers } from "next/headers";
import Link from "next/link";
import { createWebRunStore } from "../../lib/run-store";
import { ReportView } from "../../report/report-view";
import { buildShareLinks } from "../share-links";

export const dynamic = "force-dynamic";

interface SharedReportPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function SharedReportPage({ params }: SharedReportPageProps) {
  const { id } = await params;
  const saved = await (await createWebRunStore()).getRun(id);

  if (!saved) {
    return (
      <main className="shell">
        <p className="eyebrow">Project Autopsy</p>
        <h1>Shared report not found</h1>
        <p className="muted">{id}</p>
        <Link className="action-link" href="/runs">
          Back to saved runs
        </Link>
      </main>
    );
  }

  const shareLinks = buildShareLinks(saved.id, await headers());

  return (
    <ReportView
      report={saved.report}
      savedRunId={saved.id}
      sharePath={shareLinks.reportPath}
      shareUrl={shareLinks.reportUrl}
      markdownPath={shareLinks.markdownPath}
      sharedView
    />
  );
}
