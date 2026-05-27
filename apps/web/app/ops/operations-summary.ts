import type { AnalysisJob, AnalysisJobStatus } from "../lib/analysis-queue";

export type OperationsStorageMode = "memory" | "postgres";
export type OperationsAlertLevel = "warning" | "critical";

export interface OperationsAlert {
  level: OperationsAlertLevel;
  title: string;
  detail: string;
}

export interface OperationsSummary {
  storageMode: OperationsStorageMode;
  total: number;
  latestUpdatedAt?: string;
  counts: Record<AnalysisJobStatus, number>;
  alerts: OperationsAlert[];
}

export interface OperationsAlertOptions {
  now?: string;
  staleRunningMinutes?: number;
  queuedWarningThreshold?: number;
}

const emptyCounts: Record<AnalysisJobStatus, number> = {
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0
};

export function buildOperationsSummary(
  jobs: AnalysisJob[],
  storageMode: OperationsStorageMode,
  alertOptions: OperationsAlertOptions = {}
): OperationsSummary {
  const counts = jobs.reduce(
    (summary, job) => ({
      ...summary,
      [job.status]: summary[job.status] + 1
    }),
    { ...emptyCounts }
  );

  return {
    storageMode,
    total: jobs.length,
    latestUpdatedAt: jobs.map((job) => job.updatedAt).sort().at(-1),
    counts,
    alerts: buildOperationsAlerts(jobs, counts, alertOptions)
  };
}

function buildOperationsAlerts(
  jobs: AnalysisJob[],
  counts: Record<AnalysisJobStatus, number>,
  options: OperationsAlertOptions
): OperationsAlert[] {
  const alerts: OperationsAlert[] = [];
  const staleRunningMinutes = options.staleRunningMinutes ?? 30;
  const queuedWarningThreshold = options.queuedWarningThreshold ?? 5;

  if (counts.failed > 0) {
    alerts.push({
      level: "critical",
      title: "Failed jobs need review",
      detail: `${counts.failed} recent analysis ${counts.failed === 1 ? "job" : "jobs"} failed.`
    });
  }

  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  const staleRunningCount = jobs.filter(
    (job) =>
      job.status === "running" &&
      Number.isFinite(Date.parse(job.updatedAt)) &&
      nowMs - Date.parse(job.updatedAt) >= staleRunningMinutes * 60 * 1000
  ).length;

  if (staleRunningCount > 0) {
    alerts.push({
      level: "critical",
      title: "Running jobs may be stuck",
      detail: `${staleRunningCount} running ${staleRunningCount === 1 ? "job has" : "jobs have"} not updated in at least ${staleRunningMinutes} minutes.`
    });
  }

  if (counts.queued > queuedWarningThreshold) {
    alerts.push({
      level: "warning",
      title: "Queue backlog is building",
      detail: `${counts.queued} jobs are waiting for a worker.`
    });
  }

  return alerts;
}
