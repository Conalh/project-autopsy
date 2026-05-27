import {
  createWebAnalysisJobStore,
  type AnalysisJob,
  type WebAnalysisJobQueueOptions
} from "./analysis-queue";
import {
  inspectRepositoryJobPayload,
  type RepositoryInspectionJobPayload
} from "./repository-inspection";

interface ProcessNextAnalysisJobOptions extends WebAnalysisJobQueueOptions {
  inspect?: (payload: RepositoryInspectionJobPayload) => Promise<unknown>;
}

export async function processNextAnalysisJob(
  options: ProcessNextAnalysisJobOptions = {}
): Promise<AnalysisJob | undefined> {
  const store = await createWebAnalysisJobStore(options);
  if (!store) {
    throw new Error("PROJECT_AUTOPSY_POSTGRES_URL or DATABASE_URL is required for external analysis workers.");
  }

  const job = await store.claimNextQueuedJob<RepositoryInspectionJobPayload>();
  if (!job) {
    return undefined;
  }

  const payload = readRepositoryInspectionPayload(job.payload);
  const inspect = options.inspect ?? inspectRepositoryJobPayload;

  try {
    const result = await inspect(payload);
    return store.updateJob(job.id, {
      status: "completed",
      attempts: job.attempts,
      result
    });
  } catch (error) {
    const attempts = job.attempts ?? 1;
    const maxAttempts = job.maxAttempts ?? 1;
    return store.updateJob(job.id, {
      status: attempts < maxAttempts ? "queued" : "failed",
      attempts,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function readRepositoryInspectionPayload(payload: unknown): RepositoryInspectionJobPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Analysis job payload is missing.");
  }

  const candidate = payload as Partial<RepositoryInspectionJobPayload>;
  if (typeof candidate.source !== "string" || candidate.source.trim().length === 0) {
    throw new Error("Analysis job payload must include a source.");
  }

  return {
    source: candidate.source,
    save: candidate.save === true,
    ...(typeof candidate.branch === "string" && candidate.branch.trim().length > 0
      ? { branch: candidate.branch }
      : {}),
    checkDependencyRegistry: candidate.checkDependencyRegistry === true
  };
}
