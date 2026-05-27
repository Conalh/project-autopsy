import { describe, expect, test } from "vitest";
import { GET } from "./route";

describe("GitHub App status route", () => {
  test("returns setup status from environment configuration", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG = "project-autopsy";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH = "C:\\keys\\app.pem";

    try {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.githubApp).toMatchObject({
        authMode: "github_app_install_required",
        readyForPrivateRepos: false,
        installUrl: "https://github.com/apps/project-autopsy/installations/new",
        missing: ["PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID"]
      });
    } finally {
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_ID;
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG;
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH;
    }
  });
});
