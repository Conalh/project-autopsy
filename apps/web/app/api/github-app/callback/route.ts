import { saveGitHubAppInstallation } from "../../../lib/github-app-installation-store";
import { getGitHubAppSetup } from "../../../lib/github-app-setup";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id")?.trim();

  if (!installationId) {
    return Response.json(
      {
        error: "GitHub App callback must include installation_id."
      },
      { status: 400 }
    );
  }

  const setupAction = url.searchParams.get("setup_action") ?? undefined;
  const installation = saveGitHubAppInstallation({
    installationId,
    setupAction
  });

  return Response.json({
    githubApp: getGitHubAppSetup(),
    installation
  });
}
