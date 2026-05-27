import Link from "next/link";
import { createWebRunStore } from "./lib/run-store";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const recentRuns = createWebRunStore().listRuns(5);

  return (
    <main className="shell">
      <section className="inspect-bar" aria-labelledby="inspect-title">
        <div>
          <p className="eyebrow">Project Autopsy</p>
          <h1 id="inspect-title">Inspect a stalled repository</h1>
        </div>
        <form className="repo-form" action="/report">
          <label htmlFor="source">GitHub repository URL</label>
          <div className="form-row">
            <input
              id="source"
              name="source"
              type="url"
              placeholder="https://github.com/owner/repo"
              required
            />
            <button type="submit">Inspect</button>
          </div>
          <label className="check-row">
            <input name="save" type="checkbox" value="1" />
            Save this run
          </label>
          <label className="check-row">
            <input name="checkRegistry" type="checkbox" value="1" />
            Check package registries
          </label>
          <label htmlFor="branch">Branch</label>
          <input id="branch" name="branch" type="text" placeholder="Default branch" />
        </form>
      </section>

      <section className="quick-actions" aria-label="Demo reports">
        <Link className="action-link" href="/report?demo=fixture&save=1">
          Analyze and save stalled npm fixture
        </Link>
        <Link className="action-link" href="/report?source=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World">
          Inspect octocat/Hello-World
        </Link>
      </section>

      <section className="empty-state">
        <h2>Recent runs</h2>
        {recentRuns.length > 0 ? (
          <div className="recent-list">
            {recentRuns.map((run) => (
              <Link key={run.id} href={`/runs/${run.id}`}>
                <strong>{run.projectName}</strong>
                <span>{run.verdictStatus}</span>
                <em>{run.score}/100</em>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">Saved runs will appear here after you inspect with save enabled.</p>
        )}
      </section>

      <section className="empty-state">
        <h2>What the report shows</h2>
        <div className="summary-grid">
          <div>
            <strong>Verdict</strong>
            <span>Score, status, and concise reviveability summary.</span>
          </div>
          <div>
            <strong>Findings</strong>
            <span>Evidence-backed setup, validation, docs, and momentum signals.</span>
          </div>
          <div>
            <strong>Revival plan</strong>
            <span>Phased tasks with files, evidence IDs, and verification commands.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
