import { createGitHubAppCallbackState } from "../../../lib/github-app-callback-state";
import { getGitHubAppSetup } from "../../../lib/github-app-setup";

export async function GET(): Promise<Response> {
  const setup = getGitHubAppSetup();
  if (!setup.installUrl) {
    return Response.json({ error: "GitHub App install URL is not configured." }, { status: 400 });
  }

  const stateSecret = readEnv("PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET");
  if (!stateSecret) {
    return Response.json({ error: "GitHub App callback state secret is required." }, { status: 503 });
  }

  return Response.redirect(withCallbackState(setup.installUrl, stateSecret), 307);
}

function withCallbackState(installUrl: string, stateSecret: string): string {
  const url = new URL(installUrl);
  url.searchParams.set("state", createGitHubAppCallbackState(stateSecret));
  return url.toString();
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}
