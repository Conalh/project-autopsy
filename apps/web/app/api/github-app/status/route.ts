import { getGitHubAppSetupAsync } from "../../../lib/github-app-setup";
import { isPrivateRepositoryInspectionAllowed } from "../../../lib/source-policy";

export async function GET(): Promise<Response> {
  return Response.json({
    githubApp: await getGitHubAppSetupAsync(),
    privateRepositoryInspectionAllowed: isPrivateRepositoryInspectionAllowed()
  });
}
