import { createWebRunStore } from "../../../lib/run-store";
import { jsonNoStoreResponse } from "../../../lib/http-cache";
import {
  evaluateInspectAuth,
  inspectAuthFailureMessage,
  inspectAuthFailureStatus
} from "../../../lib/source-policy";

interface RunRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RunRouteContext): Promise<Response> {
  const auth = evaluateInspectAuth(request.headers);
  if (!auth.authorized) {
    return jsonNoStoreResponse({ error: inspectAuthFailureMessage(auth) }, { status: inspectAuthFailureStatus(auth) });
  }

  const { id } = await context.params;
  const run = await (await createWebRunStore()).getRun(id);

  if (!run) {
    return jsonNoStoreResponse({ error: `Saved run not found: ${id}` }, { status: 404 });
  }

  return jsonNoStoreResponse({ run });
}
