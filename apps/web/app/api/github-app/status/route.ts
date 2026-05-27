import { getGitHubAppSetup } from "../../../lib/github-app-setup";

export async function GET(): Promise<Response> {
  return Response.json({ githubApp: getGitHubAppSetup() });
}
