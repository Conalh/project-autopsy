import { describe, expect, test } from "vitest";
import { buildShareLinks } from "./share-links";

describe("share links", () => {
  test("builds relative report and export paths for a saved run", () => {
    expect(buildShareLinks("run_fixture_123")).toEqual({
      reportPath: "/share/run_fixture_123",
      markdownPath: "/api/runs/run_fixture_123/export.md",
      reportUrl: "/share/run_fixture_123"
    });
  });

  test("builds an absolute report URL from forwarded host headers", () => {
    const headers = new Headers({
      "x-forwarded-host": "autopsy.example.com",
      "x-forwarded-proto": "https",
      host: "internal:3000"
    });

    expect(buildShareLinks("run fixture", headers).reportUrl).toBe("https://autopsy.example.com/share/run%20fixture");
  });
});
