import { getAnalysisJob } from "../../../lib/analysis-queue";

interface JobRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: JobRouteContext): Promise<Response> {
  const { id } = await context.params;
  const job = getAnalysisJob(id);

  if (!job) {
    return Response.json({ error: `Analysis job not found: ${id}` }, { status: 404 });
  }

  return Response.json({ job });
}
