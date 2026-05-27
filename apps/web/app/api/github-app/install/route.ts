import { getGitHubAppSetup } from "../../../lib/github-app-setup";

export async function GET(): Promise<Response> {
  const setup = getGitHubAppSetup();
  if (!setup.installUrl) {
    return Response.json({ error: "GitHub App install URL is not configured." }, { status: 400 });
  }

  return Response.redirect(setup.installUrl, 307);
}
