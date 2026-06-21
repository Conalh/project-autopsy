import { adminAuthFailureMessage, adminAuthFailureStatus, evaluateAdminAuth } from "../../../lib/admin-auth";
import { createStoredGitHubAppCallbackState } from "../../../lib/github-app-callback-state";
import { createWebGitHubAppInstallationStore } from "../../../lib/github-app-installation-store";
import { getGitHubAppSetup } from "../../../lib/github-app-setup";
import { jsonNoStoreResponse, noStoreHeaders } from "../../../lib/http-cache";
import { hasPrivateRepositoryCredentialsConfigured, isHostedRuntime } from "../../../lib/source-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const adminAuth = evaluateAdminAuth(request.headers);
  if (!adminAuth.authorized) {
    return jsonNoStoreResponse(
      { error: adminAuthFailureMessage(adminAuth) },
      { status: adminAuthFailureStatus(adminAuth) }
    );
  }

  const setup = getGitHubAppSetup();
  if (!setup.installUrl) {
    return jsonNoStoreResponse({ error: "GitHub App install URL is not configured." }, { status: 400 });
  }

  if (!readEnv("PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET") && isCallbackStateRequired()) {
    return jsonNoStoreResponse(
      { error: "PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET is required before starting GitHub App installation." },
      { status: 503 }
    );
  }

  return new Response(null, {
    status: 307,
    headers: noStoreHeaders({
      location: await withCallbackState(setup.installUrl)
    })
  });
}

async function withCallbackState(installUrl: string): Promise<string> {
  const stateSecret = readEnv("PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET");
  if (!stateSecret) {
    return installUrl;
  }

  const url = new URL(installUrl);
  url.searchParams.set(
    "state",
    await createStoredGitHubAppCallbackState(stateSecret, await createWebGitHubAppInstallationStore())
  );
  return url.toString();
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function isCallbackStateRequired(): boolean {
  return isHostedRuntime() || hasPrivateRepositoryCredentialsConfigured();
}
