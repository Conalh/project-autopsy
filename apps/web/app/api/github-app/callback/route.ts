import { verifyGitHubAppCallbackState } from "../../../lib/github-app-callback-state";
import { saveWebGitHubAppInstallation } from "../../../lib/github-app-installation-store";
import { getGitHubAppSetupAsync } from "../../../lib/github-app-setup";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id")?.trim();
  const stateSecret = readEnv("PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET");

  if (!stateSecret) {
    return Response.json({ error: "GitHub App callback state secret is required." }, { status: 503 });
  }

  if (!installationId || !/^\d+$/.test(installationId)) {
    return Response.json(
      {
        error: "GitHub App callback must include a numeric installation_id."
      },
      { status: 400 }
    );
  }

  const state = url.searchParams.get("state")?.trim();
  if (!state) {
    return Response.json({ error: "GitHub App callback state is required." }, { status: 400 });
  }

  if (!verifyGitHubAppCallbackState(state, stateSecret)) {
    return Response.json({ error: "GitHub App callback state is invalid or expired." }, { status: 400 });
  }

  const setupAction = url.searchParams.get("setup_action") ?? undefined;
  const installation = await saveWebGitHubAppInstallation({
    installationId,
    setupAction
  });

  return Response.json({
    githubApp: await getGitHubAppSetupAsync(),
    installation
  });
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}
