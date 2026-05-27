import path from "node:path";
import Link from "next/link";
import {
  analyzeRepository,
  renderJsonReport,
  renderMarkdownReport,
  type AutopsyReport,
  type Finding,
  type RevivalTask,
  type Severity
} from "@project-autopsy/core";

interface ReportPageProps {
  searchParams: Promise<{
    source?: string;
    branch?: string;
    demo?: string;
  }>;
}

export default async function ReportPage({ searchParams }: ReportPageProps) {
  const params = await searchParams;
  const source = resolveSource(params);

  if (!source) {
    return (
      <main className="shell">
        <p className="eyebrow">Project Autopsy</p>
        <h1>No repository selected</h1>
        <p className="muted">Enter a public GitHub URL or open the fixture demo.</p>
        <Link className="action-link" href="/">
          Back to inspector
        </Link>
      </main>
    );
  }

  try {
    const report = await analyzeRepository(source, { branch: params.branch });
    return <ReportView report={report} />;
  } catch (error) {
    return (
      <main className="shell">
        <p className="eyebrow">Project Autopsy</p>
        <h1>Inspection failed</h1>
        <p className="error-text">{error instanceof Error ? error.message : String(error)}</p>
        <Link className="action-link" href="/">
          Back to inspector
        </Link>
      </main>
    );
  }
}

function ReportView({ report }: { report: AutopsyReport }) {
  const markdown = renderMarkdownReport(report);
  const json = renderJsonReport(report);

  return (
    <main className="shell report-shell">
      <header className="report-header">
        <div>
          <Link className="back-link" href="/">
            Project Autopsy
          </Link>
          <h1>{report.summary.projectName}</h1>
          <p>{report.verdict.summary}</p>
        </div>
        <div className={`score-box status-${report.verdict.status}`}>
          <span>Score</span>
          <strong>{report.verdict.score}</strong>
          <em>{report.verdict.status}</em>
        </div>
      </header>

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

          <section className="panel">
            <h2>Findings</h2>
            <div className="finding-list">
              {report.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          </section>

          <section className="panel">
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

          <section className="panel">
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

function resolveSource(params: { source?: string; demo?: string }) {
  if (params.demo === "fixture") {
    return path.resolve(process.cwd(), "../../fixtures/stalled-npm-app");
  }

  return params.source;
}
