import { headers } from "next/headers";
import Link from "next/link";
import { evaluateAdminAuth, type AdminAuthResult } from "../lib/admin-auth";
import { createWebAnalysisJobStore, listAnalysisJobs, type AnalysisJob } from "../lib/analysis-queue";
import { buildOperationsSummary, type OperationsAlert, type OperationsSummary } from "./operations-summary";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const adminAuth = evaluateAdminAuth(await headers());
  if (!adminAuth.authorized) {
    return <OperationsAccessRequired />;
  }

  const store = await createWebAnalysisJobStore({});
  const storageMode = store ? "postgres" : "memory";
  const jobs = store ? await store.listJobs(20) : listAnalysisJobs(20);
  const summary = buildOperationsSummary(jobs, storageMode);

  return (
    <main className="shell">
      <nav className="top-nav" aria-label="Primary">
        <Link href="/">Inspector</Link>
        <Link href="/runs">Saved runs</Link>
        <Link href="/ops">Operations</Link>
        <a href="/api/github-app/status">GitHub setup</a>
      </nav>

      <header className="page-heading">
        <div>
          <p className="eyebrow">Project Autopsy</p>
          <h1>Operations</h1>
          <p className="muted">Monitor hosted analysis queue state and recent worker outcomes.</p>
        </div>
      </header>

      <AdminAuthNotice auth={adminAuth} />
      <OperationsSummaryPanel summary={summary} />
      <OperationsAlertsPanel alerts={summary.alerts} />
      <RecentJobsPanel jobs={jobs} />
    </main>
  );
}

function OperationsAccessRequired() {
  return (
    <main className="shell">
      <nav className="top-nav" aria-label="Primary">
        <Link href="/">Inspector</Link>
        <Link href="/runs">Saved runs</Link>
      </nav>
      <section className="panel ops-panel ops-access-panel">
        <p className="eyebrow">Project Autopsy</p>
        <h1>Operations access required</h1>
        <p className="muted">
          This deployment requires an admin token for operational views. Send it as a bearer token or as
          <code>x-project-autopsy-admin-token</code>.
        </p>
      </section>
    </main>
  );
}

function AdminAuthNotice({ auth }: { auth: AdminAuthResult }) {
  return (
    <section className={`panel ops-panel ops-auth-notice ${auth.configured ? "ops-auth-enforced" : "ops-auth-local"}`}>
      <strong>{auth.configured ? "Admin auth enforced" : "Local operations mode"}</strong>
      <p>
        {auth.configured
          ? "Operational views require PROJECT_AUTOPSY_ADMIN_TOKEN."
          : "Set PROJECT_AUTOPSY_ADMIN_TOKEN to require an admin token for operational views."}
      </p>
    </section>
  );
}

function OperationsSummaryPanel({ summary }: { summary: OperationsSummary }) {
  return (
    <section className="panel ops-panel">
      <div className="section-title-row">
        <h2>Queue Overview</h2>
        <span className="ops-storage">{summary.storageMode}</span>
      </div>
      <dl className="ops-metric-grid">
        <Metric label="Total" value={summary.total} />
        <Metric label="Queued" value={summary.counts.queued} />
        <Metric label="Running" value={summary.counts.running} />
        <Metric label="Completed" value={summary.counts.completed} />
        <Metric label="Failed" value={summary.counts.failed} />
        <Metric label="Latest update" value={summary.latestUpdatedAt ? summary.latestUpdatedAt.slice(0, 19) : "none"} />
      </dl>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function OperationsAlertsPanel({ alerts }: { alerts: OperationsAlert[] }) {
  return (
    <section className="panel ops-panel">
      <h2>Operational Alerts</h2>
      {alerts.length > 0 ? (
        <div className="ops-alert-list" role="list">
          {alerts.map((alert) => (
            <article key={`${alert.level}-${alert.title}`} className={`ops-alert ops-alert-${alert.level}`} role="listitem">
              <strong>{alert.title}</strong>
              <p>{alert.detail}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No queue health alerts for the current job window.</p>
      )}
    </section>
  );
}

function RecentJobsPanel({ jobs }: { jobs: AnalysisJob[] }) {
  return (
    <section className="panel ops-panel">
      <h2>Recent Jobs</h2>
      {jobs.length > 0 ? (
        <div className="job-table" role="list">
          {jobs.map((job) => (
            <article key={job.id} className="job-row" role="listitem">
              <div>
                <strong>{job.id}</strong>
                <span>{job.updatedAt.slice(0, 19)}</span>
              </div>
              <span className={`job-status job-status-${job.status}`}>{job.status}</span>
              <span>
                {job.attempts ?? 0}/{job.maxAttempts ?? 1}
              </span>
              <span>{job.error ?? "No error"}</span>
              <Link className="inline-action" href={`/api/jobs/${job.id}`}>
                JSON
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No analysis jobs have been queued in this process or configured Postgres store.</p>
      )}
    </section>
  );
}
