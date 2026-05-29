import { enqueueWebAnalysisJob } from "../../../lib/analysis-queue";
import { resolveGitHubToken } from "../../../lib/github-auth";
import {
  clientKeyFromHeaders,
  createInspectRateLimiter
} from "../../../lib/inspect-rate-limit";
import {
  assertSourceAllowed,
  evaluateInspectAuth,
  SourceNotAllowedError
} from "../../../lib/source-policy";
import {
  inspectRepository,
  toRepositoryInspectionJobPayload
} from "../../../lib/repository-inspection";

interface InspectRequestBody {
  source?: unknown;
  branch?: unknown;
  save?: unknown;
  checkRegistry?: unknown;
  queue?: unknown;
}

const rateLimiter = createInspectRateLimiter();

export async function POST(request: Request): Promise<Response> {
  const auth = evaluateInspectAuth(request.headers);
  if (auth.configured && !auth.authorized) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const rate = rateLimiter.check(clientKeyFromHeaders(request.headers));
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "Too many inspection requests. Try again shortly." }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(rate.retryAfterSeconds) }
    });
  }

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
    assertSourceAllowed(body.source);


    const options = {
      branch: typeof body.branch === "string" && body.branch.trim().length > 0 ? body.branch : undefined,
      checkDependencyRegistry: body.checkRegistry === true,
      token: await resolveGitHubToken()
    };

    if (body.queue === true) {
      const payload = toRepositoryInspectionJobPayload({
        source: body.source,
        save: body.save === true,
        branch: options.branch,
        checkDependencyRegistry: options.checkDependencyRegistry
      });
      const job = await enqueueWebAnalysisJob(() => inspectRepository(body.source as string, body.save === true, options), {
        payload,
        runInline: readEnv("PROJECT_AUTOPSY_ANALYSIS_QUEUE_MODE") !== "external"
      });
      return jsonResponse({ job }, 202);
    }

    return jsonResponse(await inspectRepository(body.source, body.save === true, options));
  } catch (error) {
    if (error instanceof SourceNotAllowedError) {
      return jsonResponse({ error: error.message }, 403);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}
