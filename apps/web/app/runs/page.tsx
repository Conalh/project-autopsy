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
          <p className="muted">Review previous inspections, compare run drift, and reopen full autopsy reports.</p>
        </div>
        <Link className="action-link action-link-secondary" href="/">
          New inspection
        </Link>
      </header>

      <section className="panel compare-form-panel">
        <h2>Compare runs</h2>
        <form className="compare-form" action="/compare">
          <label htmlFor="left-run">Base run ID</label>
          <input id="left-run" name="left" type="text" placeholder="run_..." required />
          <label htmlFor="right-run">Comparison run ID</label>
          <input id="right-run" name="right" type="text" placeholder="run_..." required />
          <button type="submit">Compare</button>
        </form>
      </section>

      <section className="panel">
        {runs.length > 0 ? (
          <div className="run-table" role="list">
            {runs.map((run) => (
              <article key={run.id} className="run-table-row" role="listitem">
                <Link className="run-table-main" href={`/runs/${run.id}`}>
                  <span>
                    <strong>{run.projectName}</strong>
                    <em>{run.source}</em>
                    <code>{run.id}</code>
                  </span>
                  <span>{run.verdictStatus}</span>
                  <span>{run.score}/100</span>
                  <time>{run.createdAt.slice(0, 10)}</time>
                </Link>
                <Link className="inline-action" href={`/share/${encodeURIComponent(run.id)}`}>
                  Share
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No saved runs yet. Run an inspection with save enabled to build this list.</p>
        )}
      </section>
    </main>
  );
}
