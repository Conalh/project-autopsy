import Link from "next/link";
import { createWebRunStore } from "../../lib/run-store";
import { ReportView } from "../../report/report-view";

export const dynamic = "force-dynamic";

interface SavedRunPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function SavedRunPage({ params }: SavedRunPageProps) {
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

  return <ReportView report={saved.report} savedRunId={saved.id} />;
}
