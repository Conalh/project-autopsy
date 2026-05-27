import { describe, expect, test } from "vitest";
import { createGitHubAppCallbackState, verifyGitHubAppCallbackState } from "./github-app-callback-state";

describe("GitHub App callback state", () => {
  test("creates a signed state token that can be verified", () => {
    const state = createGitHubAppCallbackState("secret", {
      issuedAt: new Date("2026-05-27T05:00:00.000Z"),
      nonce: "nonce"
    });

    expect(verifyGitHubAppCallbackState(state, "secret", { now: new Date("2026-05-27T05:05:00.000Z") })).toBe(true);
  });

  test("rejects tampered and expired state tokens", () => {
    const state = createGitHubAppCallbackState("secret", {
      issuedAt: new Date("2026-05-27T05:00:00.000Z"),
      nonce: "nonce"
    });

    expect(verifyGitHubAppCallbackState(`${state}x`, "secret", { now: new Date("2026-05-27T05:05:00.000Z") })).toBe(false);
    expect(verifyGitHubAppCallbackState(state, "secret", { now: new Date("2026-05-27T05:16:00.000Z") })).toBe(false);
  });
});
