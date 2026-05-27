import { evaluateAdminAuth } from "../../../lib/admin-auth";
import { processAnalysisWorkerBatch } from "../../../lib/analysis-worker";

interface WorkerRunRequestBody {
  maxJobs?: unknown;
  cleanupTerminalJobsOlderThan?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const adminAuth = evaluateAdminAuth(request.headers);
  if (!adminAuth.authorized) {
    return jsonResponse({ error: "Admin token required." }, 401);
  }

  let body: WorkerRunRequestBody = {};
  try {
    body = (await request.json()) as WorkerRunRequestBody;
  } catch {
    body = {};
  }

  try {
    const worker = await processAnalysisWorkerBatch({
      maxJobs: readPositiveInteger(body.maxJobs),
      cleanupTerminalJobsOlderThan:
        typeof body.cleanupTerminalJobsOlderThan === "string" && body.cleanupTerminalJobsOlderThan.trim().length > 0
          ? body.cleanupTerminalJobsOlderThan
          : undefined
    });

    return jsonResponse({ worker });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.floor(value);
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
