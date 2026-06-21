import { getWebAnalysisJob } from "../../../lib/analysis-queue";
import { jsonNoStoreResponse } from "../../../lib/http-cache";
import {
  evaluateInspectAuth,
  inspectAuthFailureMessage,
  inspectAuthFailureStatus
} from "../../../lib/source-policy";

interface JobRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: JobRouteContext): Promise<Response> {
  const auth = evaluateInspectAuth(request.headers);
  if (!auth.authorized) {
    return jsonNoStoreResponse({ error: inspectAuthFailureMessage(auth) }, { status: inspectAuthFailureStatus(auth) });
  }

  const { id } = await context.params;
  const job = await getWebAnalysisJob(id);

  if (!job) {
    return jsonNoStoreResponse({ error: `Analysis job not found: ${id}` }, { status: 404 });
  }

  return jsonNoStoreResponse({ job });
}
