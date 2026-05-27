import { createWebRunStore } from "../../../../lib/run-store";

interface RunExportRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: RunExportRouteContext): Promise<Response> {
  const { id } = await context.params;
  const run = createWebRunStore().getRun(id);

  if (!run) {
    return Response.json({ error: `Saved run not found: ${id}` }, { status: 404 });
  }

  return new Response(run.markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8"
    }
  });
}
