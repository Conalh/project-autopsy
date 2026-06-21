import { describe, expect, test } from "vitest";
import {
  createGitHubAppCallbackState,
  createStoredGitHubAppCallbackState,
  verifyAndConsumeGitHubAppCallbackState,
  verifyGitHubAppCallbackState
} from "./github-app-callback-state";

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

  test("consumes a signed state token only once through shared storage", async () => {
    const store = new FakeCallbackStateNonceStore();
    const state = await createStoredGitHubAppCallbackState("secret", store, {
      issuedAt: new Date("2026-05-27T05:00:00.000Z"),
      nonce: "single-use-nonce"
    });

    await expect(
      verifyAndConsumeGitHubAppCallbackState(state, "secret", store, {
        now: new Date("2026-05-27T05:05:00.000Z")
      })
    ).resolves.toBe(true);
    await expect(
      verifyAndConsumeGitHubAppCallbackState(state, "secret", store, {
        now: new Date("2026-05-27T05:05:00.000Z")
      })
    ).resolves.toBe(false);
  });
});

class FakeCallbackStateNonceStore {
  private readonly nonces = new Map<string, string>();

  async issueCallbackStateNonce(input: { nonce: string; expiresAt: string }): Promise<void> {
    this.nonces.set(input.nonce, input.expiresAt);
  }

  async consumeCallbackStateNonce(nonce: string, options: { now?: Date } = {}): Promise<boolean> {
    const expiresAt = this.nonces.get(nonce);
    if (!expiresAt || Date.parse(expiresAt) < (options.now?.getTime() ?? Date.now())) {
      return false;
    }

    this.nonces.delete(nonce);
    return true;
  }
}
