import { adminAuthFailureMessage, adminAuthFailureStatus, evaluateAdminAuth } from "../../../lib/admin-auth";
import { getGitHubAppSetupAsync } from "../../../lib/github-app-setup";
import { jsonNoStoreResponse } from "../../../lib/http-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const adminAuth = evaluateAdminAuth(request.headers);
  if (!adminAuth.authorized) {
    return jsonNoStoreResponse(
      { error: adminAuthFailureMessage(adminAuth) },
      { status: adminAuthFailureStatus(adminAuth) }
    );
  }

  return jsonNoStoreResponse({ githubApp: await getGitHubAppSetupAsync() });
}
