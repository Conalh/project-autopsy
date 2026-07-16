import { headers } from "next/headers";
import Link from "next/link";
import { AccessRequired } from "../../lib/access-ui";
import { createWebRunStore } from "../../lib/run-store";
import { evaluateInspectAuth, inspectAuthFailureMessage } from "../../lib/source-policy";
import { ReportView } from "../../report/report-view";
import { buildShareLinks } from "../../share/share-links";

export const dynamic = "force-dynamic";

interface SavedRunPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function SavedRunPage({ params }: SavedRunPageProps) {
  const auth = evaluateInspectAuth(await headers());
  if (!auth.authorized) {
    return (
      <AccessRequired
        title="Saved-run access required"
        message={inspectAuthFailureMessage(auth)}
        href="/runs"
      />
    );
  }

  const { id } = await params;
  const saved = await (await createWebRunStore()).getRun(id);

  if (!saved) {
    return (
      <main className="shell">
        <p className="eyebrow">Project Autopsy</p>
        <h1>Saved run not found</h1>
        <p className="muted">{id}</p>
        <Link className="action-link" href="/">
          Back to inspector
        </Link>
      </main>
    );
  }

  const shareLinks = buildShareLinks(saved.id);

  return (
    <ReportView
      report={saved.report}
      savedRunId={saved.id}
      sharePath={shareLinks.reportPath}
      shareUrl={shareLinks.reportUrl}
      markdownPath={shareLinks.markdownPath}
    />
  );
}
