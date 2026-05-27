import { describe, expect, test } from "vitest";
import { GET } from "./route";

describe("GitHub App install route", () => {
  test("redirects to the configured GitHub App install URL", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG = "project-autopsy";

    try {
      const response = await GET();

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://github.com/apps/project-autopsy/installations/new");
    } finally {
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG;
    }
  });

  test("returns a setup error when no install URL can be built", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("GitHub App install URL is not configured.");
  });
});
