import { randomUUID } from "node:crypto";

export type AnalysisJobStatus = "queued" | "running" | "completed" | "failed";

export interface AnalysisJob<Result = unknown> {
  id: string;
  status: AnalysisJobStatus;
  createdAt: string;
  updatedAt: string;
  result?: Result;
  error?: string;
}

interface InternalAnalysisJob<Result> extends AnalysisJob<Result> {
  done: Promise<AnalysisJob<Result>>;
  resolveDone: (job: AnalysisJob<Result>) => void;
}

const jobs = new Map<string, InternalAnalysisJob<unknown>>();

export function enqueueAnalysisJob<Result>(work: () => Promise<Result>): AnalysisJob<Result> {
  const id = `job_${randomUUID()}`;
  const now = new Date().toISOString();
  let resolveDone: (job: AnalysisJob<Result>) => void = () => undefined;
  const done = new Promise<AnalysisJob<Result>>((resolve) => {
    resolveDone = resolve;
  });
  const job: InternalAnalysisJob<Result> = {
    id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    done,
    resolveDone
  };
  jobs.set(id, job as InternalAnalysisJob<unknown>);

  void runJob(job, work);

  return serializeJob(job);
}

export function getAnalysisJob<Result = unknown>(id: string): AnalysisJob<Result> | undefined {
  const job = jobs.get(id);
  return job ? serializeJob(job as InternalAnalysisJob<Result>) : undefined;
}

export async function waitForAnalysisJob<Result = unknown>(id: string): Promise<AnalysisJob<Result>> {
  const job = jobs.get(id);
  if (!job) {
    throw new Error(`Analysis job not found: ${id}`);
  }

  if (job.status === "completed" || job.status === "failed") {
    return serializeJob(job as InternalAnalysisJob<Result>);
  }

  return (await job.done) as AnalysisJob<Result>;
}

export function clearAnalysisJobs(): void {
  jobs.clear();
}

async function runJob<Result>(job: InternalAnalysisJob<Result>, work: () => Promise<Result>): Promise<void> {
  updateJob(job, { status: "running" });

  try {
    const result = await work();
    updateJob(job, { status: "completed", result });
  } catch (error) {
    updateJob(job, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    job.resolveDone(serializeJob(job));
  }
}

function updateJob<Result>(job: InternalAnalysisJob<Result>, patch: Partial<AnalysisJob<Result>>): void {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function serializeJob<Result>(job: InternalAnalysisJob<Result>): AnalysisJob<Result> {
  const { done: _done, resolveDone: _resolveDone, ...serialized } = job;
  return serialized;
}
