import Link from "next/link";
import { createWebRunStore } from "../lib/run-store";
import {
  buildRunFilterOptions,
  createRunFilters,
  filterRuns,
  groupRunsByProjectAndSource
} from "./run-filters";
import { buildRunTrendItems, buildRunTrendSummary, type RunTrendItem } from "./run-trends";

export const dynamic = "force-dynamic";

interface RunsPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sourceType?: string;
  }>;
}

export default async function RunsPage({ searchParams }: RunsPageProps) {
  const params = await searchParams;
  const runs = await (await createWebRunStore()).listRuns(50);
  const filters = createRunFilters(params);
  const filterOptions = buildRunFilterOptions(runs);
  const filteredRuns = filterRuns(runs, filters);
  const groupedRuns = groupRunsByProjectAndSource(filteredRuns);
  const trendItems = buildRunTrendItems(runs);
  const trendSummary = buildRunTrendSummary(trendItems);

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

      <section className="panel run-filter-panel">
        <div className="section-title-row">
          <h2>Filter saved runs</h2>
          <span className="ops-storage">{filteredRuns.length} shown</span>
        </div>
        <form className="run-filter-form" action="/runs">
          <label htmlFor="run-query">Search</label>
          <input id="run-query" name="q" type="search" defaultValue={filters.query} placeholder="Project, source, or run ID" />
          <label htmlFor="run-status">Status</label>
          <select id="run-status" name="status" defaultValue={filters.status}>
            <option value="">All statuses</option>
            {filterOptions.statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <label htmlFor="run-source-type">Source</label>
          <select id="run-source-type" name="sourceType" defaultValue={filters.sourceType}>
            <option value="">All sources</option>
            {filterOptions.sourceTypes.map((sourceType) => (
              <option key={sourceType} value={sourceType}>
                {sourceType}
              </option>
            ))}
          </select>
          <button type="submit">Apply</button>
          <Link className="inline-action" href="/runs">
            Reset
          </Link>
        </form>
      </section>

      <section className="panel run-trend-panel">
        <div className="section-title-row">
          <h2>Recent score trend</h2>
          <span className="ops-storage">{trendSummary.itemCount} runs</span>
        </div>
        {trendItems.length > 0 ? (
          <>
            <dl className="run-trend-summary">
              <div>
                <dt>Latest score</dt>
                <dd>{trendSummary.latestScore}/100</dd>
              </div>
              <div>
                <dt>Latest delta</dt>
                <dd className={deltaClass(trendSummary.latestDelta ?? 0)}>{formatDelta(trendSummary.latestDelta ?? 0)}</dd>
              </div>
              <div>
                <dt>Best saved score</dt>
                <dd>{trendSummary.bestScore}/100</dd>
              </div>
            </dl>
            <div className="run-trend-list" aria-label="Recent saved run score trend">
              {trendItems.map((item) => (
                <RunTrendRow key={item.id} item={item} />
              ))}
            </div>
          </>
        ) : (
          <p className="muted">No saved runs yet. Save repeated inspections to build a score trend.</p>
        )}
      </section>

      <section className="panel">
        {groupedRuns.length > 0 ? (
          <div className="run-table" role="list">
            {groupedRuns.map((group) => (
              <section key={group.key} className="run-group" aria-label={`${group.projectName} saved runs`}>
                <div className="run-group-heading">
                  <div>
                    <h2>{group.projectName}</h2>
                    <p>{group.source}</p>
                  </div>
                  <span>{group.runs.length} runs</span>
                </div>
                {group.runs.map((run) => (
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
              </section>
            ))}
          </div>
        ) : runs.length > 0 ? (
          <p className="muted">No saved runs match the current filters.</p>
        ) : (
          <p className="muted">No saved runs yet. Run an inspection with save enabled to build this list.</p>
        )}
      </section>
    </main>
  );
}

function RunTrendRow({ item }: { item: RunTrendItem }) {
  return (
    <Link className="run-trend-row" href={`/runs/${item.id}`}>
      <span>
        <strong>{item.dateLabel}</strong>
        <em>{item.projectName}</em>
      </span>
      <span className="run-trend-track" aria-hidden="true">
        <span className={`run-trend-fill status-fill-${item.verdictStatus}`} style={{ width: `${item.score}%` }} />
      </span>
      <span className="run-trend-score">{item.score}/100</span>
      <span className={deltaClass(item.scoreDelta ?? 0)}>{item.scoreDelta === undefined ? "baseline" : formatDelta(item.scoreDelta)}</span>
    </Link>
  );
}

function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

function deltaClass(value: number): string {
  if (value > 0) {
    return "delta-positive";
  }

  if (value < 0) {
    return "delta-negative";
  }

  return "delta-neutral";
}
