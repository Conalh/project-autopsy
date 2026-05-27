import {
  renderJsonReport,
  renderMarkdownReport,
  type AutopsyReport,
  type Finding,
  type ManifestRecord,
  type RevivalTask,
  type Severity
} from "@project-autopsy/core";
import { buildSeverityChartItems, type SeverityChartItem } from "./report-charts";
import { buildReportNavigation } from "./report-navigation";
import { buildDependencySummary, buildTimelineItems, type TimelineItem } from "./report-summary";

export function ReportView({
  report,
  savedRunId,
  shareUrl,
  sharePath,
  markdownPath,
  sharedView = false
}: {
  report: AutopsyReport;
  savedRunId?: string;
  shareUrl?: string;
  sharePath?: string;
  markdownPath?: string;
  sharedView?: boolean;
}) {
  const markdown = renderMarkdownReport(report);
  const json = renderJsonReport(report);
  const timelineItems = buildTimelineItems(report);
  const dependencySummary = buildDependencySummary(report);
  const severityChartItems = buildSeverityChartItems(report);
  const navigation = buildReportNavigation(report);

  return (
    <main className="shell report-shell">
      <nav className="top-nav" aria-label="Primary">
        <a href="/">Inspector</a>
        <a href="/runs">Saved runs</a>
        <a href="/api/github-app/status">GitHub setup</a>
      </nav>

      <header id="verdict" className="report-header">
        <div>
          <a className="back-link" href="/">
            Project Autopsy
          </a>
          <h1>{report.summary.projectName}</h1>
          <p>{report.verdict.summary}</p>
          {savedRunId ? <p className="saved-note">Saved as {savedRunId}</p> : null}
          {savedRunId ? (
            <div className="report-actions">
              {!sharedView && sharePath ? (
                <a className="inline-action" href={sharePath}>
                  Share report
                </a>
              ) : null}
              <a className="inline-action" href={markdownPath ?? `/api/runs/${savedRunId}/export.md`}>
                Export Markdown
              </a>
            </div>
          ) : null}
          {shareUrl ? (
            <label className="share-url-field">
              <span>Share URL</span>
              <input readOnly value={shareUrl} aria-label="Shareable report URL" />
            </label>
          ) : null}
        </div>
        <div className={`score-box status-${report.verdict.status}`}>
          <span>Score</span>
          <strong>{report.verdict.score}</strong>
          <em>{report.verdict.status}</em>
        </div>
      </header>

      <nav className="report-nav" aria-label="Report sections">
        {navigation.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="report-layout">
        <section className="main-stack">
          <section className="panel">
            <h2>Stall Hypotheses</h2>
            <ol className="hypothesis-list">
              {report.stallHypotheses.map((hypothesis) => (
                <li key={hypothesis.rank}>
                  <strong>{hypothesis.title}</strong>
                  <span>{hypothesis.confidence} confidence</span>
                  <p>{hypothesis.rationale}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="timeline" className="panel">
            <h2>Activity Timeline</h2>
            {timelineItems.length > 0 ? (
              <div className="timeline-list">
                {timelineItems.map((item) => (
                  <TimelineRow key={item.key} item={item} />
                ))}
              </div>
            ) : (
              <p className="muted">No commit history was available for this inspection.</p>
            )}
          </section>

          <section id="findings" className="panel">
            <h2>Findings</h2>
            <div className="finding-list">
              {report.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          </section>

          <section id="revival-plan" className="panel">
            <h2>Revival Plan</h2>
            <div className="task-list">
              {report.revivalTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        </section>

        <aside className="side-stack">
          <section className="panel">
            <h2>Snapshot</h2>
            <dl className="fact-list">
              <div>
                <dt>Source</dt>
                <dd>{report.summary.sourceType}</dd>
              </div>
              <div>
                <dt>Files</dt>
                <dd>{report.summary.fileCount}</dd>
              </div>
              <div>
                <dt>Technology</dt>
                <dd>{report.summary.technologies.join(", ") || "Unknown"}</dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>{report.metadata.reportSchemaVersion}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <h2>Finding Severity</h2>
            <SeverityChart items={severityChartItems} />
          </section>

          <section id="dependencies" className="panel">
            <h2>Dependency Focus</h2>
            <dl className="metric-grid">
              <div>
                <dt>Manifests</dt>
                <dd>{dependencySummary.manifestCount}</dd>
              </div>
              <div>
                <dt>Managers</dt>
                <dd>{dependencySummary.managerLabels}</dd>
              </div>
              <div>
                <dt>Runtime deps</dt>
                <dd>{dependencySummary.dependencyCount}</dd>
              </div>
              <div>
                <dt>Dev deps</dt>
                <dd>{dependencySummary.devDependencyCount}</dd>
              </div>
              <div>
                <dt>Scripts</dt>
                <dd>{dependencySummary.scriptCount}</dd>
              </div>
              <div>
                <dt>Drift findings</dt>
                <dd>{dependencySummary.driftFindingCount}</dd>
              </div>
            </dl>
            <div className="manifest-list">
              {report.snapshot.manifests.length > 0 ? (
                report.snapshot.manifests.map((manifest) => (
                  <ManifestCard key={manifest.path} manifest={manifest} />
                ))
              ) : (
                <p className="muted">No supported manifests were detected.</p>
              )}
            </div>
          </section>

          <section className="panel">
            <h2>Exports</h2>
            <details>
              <summary>Markdown</summary>
              <textarea readOnly value={markdown} aria-label="Markdown report export" />
            </details>
            <details>
              <summary>JSON</summary>
              <textarea readOnly value={json} aria-label="JSON report export" />
            </details>
          </section>

          <section id="evidence" className="panel">
            <h2>Evidence Index</h2>
            <div className="evidence-list">
              {Object.values(report.evidenceIndex).map((evidence) => (
                <div key={evidence.id}>
                  <strong>[{evidence.id}]</strong>
                  <span>{evidence.path ?? evidence.commitSha ?? evidence.kind}</span>
                  <p>{evidence.excerpt}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function SeverityChart({ items }: { items: SeverityChartItem[] }) {
  return (
    <div className="bar-chart" aria-label="Finding severity distribution">
      {items.map((item) => (
        <div key={item.severity} className="bar-chart-row">
          <div className="bar-chart-label">
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </div>
          <div className="bar-track" aria-hidden="true">
            <span className={`bar-fill severity-fill-${item.severity}`} style={{ width: `${item.percent}%` }} />
          </div>
          <span className="bar-chart-percent">{item.percent}%</span>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  return (
    <article className="timeline-row">
      <time>{item.date}</time>
      <div>
        <h3>{item.title}</h3>
        <p>{item.detail}</p>
      </div>
    </article>
  );
}

function ManifestCard({ manifest }: { manifest: ManifestRecord }) {
  return (
    <article className="manifest-card">
      <div className="card-title-row">
        <h3>{manifest.path}</h3>
        <span className="manifest-manager">{manifest.manager}</span>
      </div>
      <dl className="fact-list">
        <div>
          <dt>Dependencies</dt>
          <dd>{formatNameValueMap(manifest.dependencies)}</dd>
        </div>
        {Object.keys(manifest.devDependencies).length > 0 ? (
          <div>
            <dt>Dev dependencies</dt>
            <dd>{formatNameValueMap(manifest.devDependencies)}</dd>
          </div>
        ) : null}
        {Object.keys(manifest.scripts).length > 0 ? (
          <div>
            <dt>Scripts</dt>
            <dd>{formatNameValueMap(manifest.scripts)}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

function formatNameValueMap(values: Record<string, string>) {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([name, value]) => `${name} ${value}`.trim()).join(", ");
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className="finding-card">
      <div className="card-title-row">
        <h3>{finding.title}</h3>
        <SeverityBadge severity={finding.severity} />
      </div>
      <p>{finding.body}</p>
      <span className="evidence-ref">{(finding.evidenceIds ?? []).map((id) => `[${id}]`).join(" ")}</span>
    </article>
  );
}

function TaskCard({ task }: { task: RevivalTask }) {
  return (
    <article className="task-card">
      <span className="task-id">{task.id}</span>
      <h3>
        {task.phase}: {task.title}
      </h3>
      <p>{task.rationale}</p>
      <dl className="task-facts">
        <div>
          <dt>Files</dt>
          <dd>{task.files.join(", ") || "No specific files"}</dd>
        </div>
        <div>
          <dt>Verify</dt>
          <dd>
            <code>{task.verificationCommand}</code>
          </dd>
        </div>
      </dl>
    </article>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`severity severity-${severity}`}>{severity}</span>;
}
