import Link from "next/link";

export default function HomePage() {
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
          <label htmlFor="branch">Branch</label>
          <input id="branch" name="branch" type="text" placeholder="Default branch" />
        </form>
      </section>

      <section className="quick-actions" aria-label="Demo reports">
        <Link className="action-link" href="/report?demo=fixture">
          Open stalled npm fixture
        </Link>
        <Link className="action-link" href="/report?source=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World">
          Inspect octocat/Hello-World
        </Link>
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
