import { describe, expect, test } from "vitest";
import { GET } from "./route";

describe("GitHub App status route", () => {
  test("returns setup status from environment configuration", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG = "project-autopsy";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH = "C:\\keys\\app.pem";
    process.env.PROJECT_AUTOPSY_ADMIN_TOKEN = "admin-secret";

    try {
      const response = await GET(
        new Request("http://localhost/api/github-app/status", {
          headers: { authorization: "Bearer admin-secret" }
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(body.githubApp).toMatchObject({
        authMode: "github_app_install_required",
        readyForPrivateRepos: false,
        installUrl: "https://github.com/apps/project-autopsy/installations/new",
        missing: [
          "PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID",
          "PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET"
        ]
      });
      expect(body.privateRepositoryInspectionAllowed).toBe(false);
    } finally {
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_ID;
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG;
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH;
      delete process.env.PROJECT_AUTOPSY_ADMIN_TOKEN;
    }
  });

  test("requires admin auth when private-capable app credentials are configured", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH = "C:\\keys\\app.pem";

    try {
      const response = await GET(new Request("http://localhost/api/github-app/status"));
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.error).toContain("PROJECT_AUTOPSY_ADMIN_TOKEN");
    } finally {
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_ID;
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH;
    }
  });

  test("rejects an incorrect admin token when one is configured", async () => {
    process.env.PROJECT_AUTOPSY_ADMIN_TOKEN = "admin-secret";

    try {
      const response = await GET(
        new Request("http://localhost/api/github-app/status", {
          headers: { authorization: "Bearer wrong" }
        })
      );
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Admin token required.");
    } finally {
      delete process.env.PROJECT_AUTOPSY_ADMIN_TOKEN;
    }
  });
});
