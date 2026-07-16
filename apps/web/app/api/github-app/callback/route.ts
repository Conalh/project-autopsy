import { verifyAndConsumeGitHubAppCallbackState } from "../../../lib/github-app-callback-state";
import {
  createWebGitHubAppInstallationStore,
  saveWebGitHubAppInstallation
} from "../../../lib/github-app-installation-store";
import { getGitHubAppSetupAsync } from "../../../lib/github-app-setup";
import { jsonNoStoreResponse } from "../../../lib/http-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id")?.trim();
  const stateSecret = readEnv("PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET");

  if (!stateSecret) {
    return jsonNoStoreResponse(
      { error: "PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET is required for GitHub App callbacks." },
      { status: 503 }
    );
  }

  if (!installationId || !/^\d+$/.test(installationId)) {
    return jsonNoStoreResponse(
      {
        error: "GitHub App callback must include a numeric installation_id."
      },
      { status: 400 }
    );
  }

  const state = url.searchParams.get("state")?.trim();
  if (!state) {
    return jsonNoStoreResponse({ error: "GitHub App callback state is required." }, { status: 400 });
  }

  if (
    !(await verifyAndConsumeGitHubAppCallbackState(
      state,
      stateSecret,
      await createWebGitHubAppInstallationStore()
    ))
  ) {
    return jsonNoStoreResponse({ error: "GitHub App callback state is invalid or expired." }, { status: 400 });
  }

  const setupAction = url.searchParams.get("setup_action") ?? undefined;
  const installation = await saveWebGitHubAppInstallation({
    installationId,
    setupAction
  });

  return jsonNoStoreResponse({
    githubApp: await getGitHubAppSetupAsync(),
    installation
  });
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}
