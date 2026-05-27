import Link from "next/link";
import { createWebRunStore } from "../lib/run-store";
import {
  buildFindingDeltaChartItems,
  buildRunComparison,
  type FindingDeltaChartItem,
  type RunComparison
} from "./run-comparison";

export const dynamic = "force-dynamic";

interface ComparePageProps {
  searchParams: Promise<{
    left?: string;
    right?: string;
  }>;
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const leftId = params.left?.trim();
  const rightId = params.right?.trim();

  if (!leftId || !rightId) {
    return (
      <main className="shell">
        <CompareHeader />
        <section className="panel">
          <h2>Select two saved runs</h2>
          <p className="muted">Open saved runs, copy two run IDs, then compare their report scores and findings.</p>
          <Link className="action-link" href="/runs">
            Open saved runs
          </Link>
        </section>
      </main>
    );
  }

  const store = await createWebRunStore();
  const [leftRun, rightRun] = await Promise.all([store.getRun(leftId), store.getRun(rightId)]);

  if (!leftRun || !rightRun) {
    return (
      <main className="shell">
        <CompareHeader />
        <section className="panel">
          <h2>Saved run not found</h2>
          <p className="error-text">
            Missing {leftRun ? "" : leftId}
            {!leftRun && !rightRun ? " and " : ""}
            {rightRun ? "" : rightId}
          </p>
          <Link className="action-link" href="/runs">
            Back to saved runs
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <CompareHeader />
      <RunComparisonView comparison={buildRunComparison(leftRun, rightRun)} />
    </main>
  );
}

function CompareHeader() {
  return (
    <>
      <nav className="top-nav" aria-label="Primary">
        <Link href="/">Inspector</Link>
        <Link href="/runs">Saved runs</Link>
      </nav>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Project Autopsy</p>
          <h1>Compare saved runs</h1>
          <p className="muted">Track report drift between two saved inspections.</p>
        </div>
      </header>
    </>
  );
}

function RunComparisonView({ comparison }: { comparison: RunComparison }) {
  const findingDeltaChartItems = buildFindingDeltaChartItems(comparison.findingDeltas);

  return (
    <div className="compare-stack">
      <section className="compare-grid" aria-label="Run summaries">
        <RunSummaryCard label="Base run" run={comparison.left} />
        <RunSummaryCard label="Comparison run" run={comparison.right} />
        <article className="panel score-delta-panel">
          <span>Score delta</span>
          <strong className={deltaClass(comparison.scoreDelta)}>{formatDelta(comparison.scoreDelta)}</strong>
          <em>{comparison.right.score}/100 vs {comparison.left.score}/100</em>
        </article>
      </section>

      <section className="panel">
        <h2>Report Deltas</h2>
        <dl className="delta-grid">
          <DeltaMetric label="Files" value={comparison.fileDelta} />
          <DeltaMetric label="Revival tasks" value={comparison.taskDelta} />
          <DeltaMetric label="High findings" value={comparison.findingDeltas.high} />
          <DeltaMetric label="Medium findings" value={comparison.findingDeltas.medium} />
          <DeltaMetric label="Low findings" value={comparison.findingDeltas.low} />
          <DeltaMetric label="Info findings" value={comparison.findingDeltas.info} />
        </dl>
      </section>

      <section className="panel">
        <h2>Finding Delta Chart</h2>
        <FindingDeltaChart items={findingDeltaChartItems} />
      </section>

      <section className="comparison-kind-grid">
        <FindingKindPanel title="Added finding kinds" kinds={comparison.addedFindingKinds} emptyText="No new finding kinds." />
        <FindingKindPanel
          title="Resolved finding kinds"
          kinds={comparison.resolvedFindingKinds}
          emptyText="No finding kinds disappeared."
        />
        <FindingKindPanel title="Shared finding kinds" kinds={comparison.sharedFindingKinds} emptyText="No overlap." />
      </section>
    </div>
  );
}

function FindingDeltaChart({ items }: { items: FindingDeltaChartItem[] }) {
  return (
    <div className="delta-chart" aria-label="Finding severity delta chart">
      {items.map((item) => (
        <div key={item.severity} className="delta-chart-row">
          <div className="bar-chart-label">
            <span>{item.label}</span>
            <strong className={deltaClass(item.value)}>{formatDelta(item.value)}</strong>
          </div>
          <div className="delta-track" aria-hidden="true">
            <span
              className={`delta-fill ${item.value < 0 ? "delta-fill-negative" : "delta-fill-positive"}`}
              style={{ width: `${item.magnitudePercent}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RunSummaryCard({ label, run }: { label: string; run: RunComparison["left"] }) {
  return (
    <article className="panel run-compare-card">
      <span>{label}</span>
      <h2>{run.projectName}</h2>
      <dl className="fact-list">
        <div>
          <dt>Run ID</dt>
          <dd>
            <code>{run.id}</code>
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{run.createdAt.slice(0, 10)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`status-pill status-pill-${run.verdictStatus}`}>{run.verdictStatus}</span>
          </dd>
        </div>
      </dl>
      <Link className="inline-action" href={`/runs/${run.id}`}>
        Open report
      </Link>
    </article>
  );
}

function DeltaMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={deltaClass(value)}>{formatDelta(value)}</dd>
    </div>
  );
}

function FindingKindPanel({ title, kinds, emptyText }: { title: string; kinds: string[]; emptyText: string }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {kinds.length > 0 ? (
        <ul className="comparison-list">
          {kinds.map((kind) => (
            <li key={kind}>{kind}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">{emptyText}</p>
      )}
    </section>
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
