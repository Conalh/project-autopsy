import Link from "next/link";
import { createWebRunStore } from "../lib/run-store";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await (await createWebRunStore()).listRuns(50);

  return (
    <main className="shell">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Project Autopsy</p>
          <h1>Saved runs</h1>
          <p className="muted">Review previous inspections and reopen full autopsy reports.</p>
        </div>
        <Link className="action-link action-link-secondary" href="/">
          New inspection
        </Link>
      </header>

      <section className="panel">
        {runs.length > 0 ? (
          <div className="run-table" role="list">
            {runs.map((run) => (
              <Link key={run.id} href={`/runs/${run.id}`} role="listitem">
                <span>
                  <strong>{run.projectName}</strong>
                  <em>{run.source}</em>
                </span>
                <span>{run.verdictStatus}</span>
                <span>{run.score}/100</span>
                <time>{run.createdAt.slice(0, 10)}</time>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">No saved runs yet. Run an inspection with save enabled to build this list.</p>
        )}
      </section>
    </main>
  );
}
