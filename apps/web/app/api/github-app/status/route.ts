import { getGitHubAppSetupAsync } from "../../../lib/github-app-setup";

export async function GET(): Promise<Response> {
  return Response.json({ githubApp: await getGitHubAppSetupAsync() });
}
