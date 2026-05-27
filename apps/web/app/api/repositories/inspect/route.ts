import { analyzeAndSaveRepository, analyzeRepository } from "@project-autopsy/core";
import { createWebRunStore } from "../../../lib/run-store";
import { resolveGitHubToken } from "../../../lib/github-auth";

interface InspectRequestBody {
  source?: unknown;
  branch?: unknown;
  save?: unknown;
  checkRegistry?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: InspectRequestBody;
  try {
    body = (await request.json()) as InspectRequestBody;
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  if (typeof body.source !== "string" || body.source.trim().length === 0) {
    return jsonResponse({ error: "Request body must include a non-empty source string." }, 400);
  }

  try {
    const options = {
      branch: typeof body.branch === "string" && body.branch.trim().length > 0 ? body.branch : undefined,
      checkDependencyRegistry: body.checkRegistry === true,
      token: await resolveGitHubToken()
    };

    if (body.save === true) {
      const saved = await analyzeAndSaveRepository(body.source, {
        ...options,
        store: await createWebRunStore()
      });
      const { markdown, json, ...run } = saved;
      return jsonResponse({ run, report: saved.report });
    }

    const report = await analyzeRepository(body.source, options);
    return jsonResponse({ report });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
