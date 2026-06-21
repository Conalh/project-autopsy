import { describe, expect, test } from "vitest";
import nextConfig from "./next.config";

describe("Next.js security headers", () => {
  test("marks sensitive pages and APIs private no-store", async () => {
    const headers = await nextConfig.headers?.();
    const noStoreSources = new Set(
      headers
        ?.filter((entry) =>
          entry.headers.some((header) => header.key.toLowerCase() === "cache-control" && header.value === "private, no-store")
        )
        .map((entry) => entry.source)
    );

    expect(noStoreSources).toEqual(
      new Set(["/", "/report", "/runs", "/runs/:path*", "/share/:path*", "/compare", "/ops", "/api/:path*"])
    );
  });
});
