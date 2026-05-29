import { afterEach, describe, expect, test } from "vitest";
import { buildShareLinks } from "./share-links";

afterEach(() => {
  delete process.env.PROJECT_AUTOPSY_PUBLIC_URL;
  delete process.env.PROJECT_AUTOPSY_ALLOWED_HOSTS;
});

describe("share links", () => {
  test("builds relative report and export paths for a saved run", () => {
    expect(buildShareLinks("run_fixture_123")).toEqual({
      reportPath: "/share/run_fixture_123",
      markdownPath: "/api/runs/run_fixture_123/export.md",
      reportUrl: "/share/run_fixture_123"
    });
  });

  test("builds an absolute report URL from an allow-listed forwarded host", () => {
    process.env.PROJECT_AUTOPSY_ALLOWED_HOSTS = "autopsy.example.com";
    const headers = new Headers({
      "x-forwarded-host": "autopsy.example.com",
      "x-forwarded-proto": "https",
      host: "internal:3000"
    });

    expect(buildShareLinks("run fixture", headers).reportUrl).toBe("https://autopsy.example.com/share/run%20fixture");
  });

  test("ignores a forwarded host that is not allow-listed", () => {
    const headers = new Headers({
      "x-forwarded-host": "attacker.example.com",
      "x-forwarded-proto": "https"
    });

    expect(buildShareLinks("run_fixture_123", headers).reportUrl).toBe("/share/run_fixture_123");
  });

  test("prefers the configured public base URL over request headers", () => {
    process.env.PROJECT_AUTOPSY_PUBLIC_URL = "https://autopsy.example.com";
    const headers = new Headers({
      "x-forwarded-host": "attacker.example.com",
      "x-forwarded-proto": "http"
    });

    expect(buildShareLinks("run_fixture_123", headers).reportUrl).toBe(
      "https://autopsy.example.com/share/run_fixture_123"
    );
  });
});
