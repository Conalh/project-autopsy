import type { AnalysisJob, AnalysisJobStatus } from "../lib/analysis-queue";

export type OperationsStorageMode = "memory" | "postgres";

export interface OperationsSummary {
  storageMode: OperationsStorageMode;
  total: number;
  latestUpdatedAt?: string;
  counts: Record<AnalysisJobStatus, number>;
}

const emptyCounts: Record<AnalysisJobStatus, number> = {
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0
};

export function buildOperationsSummary(jobs: AnalysisJob[], storageMode: OperationsStorageMode): OperationsSummary {
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
    counts
  };
}
