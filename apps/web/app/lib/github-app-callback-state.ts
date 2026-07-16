import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

interface CreateGitHubAppCallbackStateOptions {
  issuedAt?: Date;
  nonce?: string;
  maxAgeMs?: number;
}

interface VerifyGitHubAppCallbackStateOptions {
  maxAgeMs?: number;
  now?: Date;
}

interface GitHubAppCallbackStateNonceStore {
  issueCallbackStateNonce(input: { nonce: string; expiresAt: string }): Promise<void>;
  consumeCallbackStateNonce(nonce: string, options?: { now?: Date }): Promise<boolean>;
}

interface GitHubAppCallbackStatePayload {
  issuedAt: string;
  nonce: string;
}

export function createGitHubAppCallbackState(
  secret: string,
  options: CreateGitHubAppCallbackStateOptions = {}
): string {
  const payload: GitHubAppCallbackStatePayload = {
    issuedAt: (options.issuedAt ?? new Date()).toISOString(),
    nonce: options.nonce ?? randomBytes(16).toString("base64url")
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signStatePayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function createStoredGitHubAppCallbackState(
  secret: string,
  store: GitHubAppCallbackStateNonceStore,
  options: CreateGitHubAppCallbackStateOptions = {}
): Promise<string> {
  const state = createGitHubAppCallbackState(secret, options);
  const payload = readVerifiedStatePayload(state, secret, {
    ...options,
    now: options.issuedAt ?? new Date()
  });
  if (!payload) {
    throw new Error("Generated GitHub App callback state could not be verified.");
  }

  await store.issueCallbackStateNonce({
    nonce: payload.nonce,
    expiresAt: new Date(Date.parse(payload.issuedAt) + (options.maxAgeMs ?? DEFAULT_MAX_AGE_MS)).toISOString()
  });

  return state;
}

export function verifyGitHubAppCallbackState(
  state: string,
  secret: string,
  options: VerifyGitHubAppCallbackStateOptions = {}
): boolean {
  return Boolean(readVerifiedStatePayload(state, secret, options));
}

export function verifyAndConsumeGitHubAppCallbackState(
  state: string,
  secret: string,
  store: GitHubAppCallbackStateNonceStore,
  options: VerifyGitHubAppCallbackStateOptions = {}
): Promise<boolean> {
  const payload = readVerifiedStatePayload(state, secret, options);
  if (!payload) {
    return Promise.resolve(false);
  }

  return store.consumeCallbackStateNonce(payload.nonce, { now: options.now });
}

function readVerifiedStatePayload(
  state: string,
  secret: string,
  options: VerifyGitHubAppCallbackStateOptions
): GitHubAppCallbackStatePayload | undefined {
  const [encodedPayload, signature, extra] = state.split(".");
  if (!encodedPayload || !signature || extra) {
    return undefined;
  }

  const expectedSignature = signStatePayload(encodedPayload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) {
    return undefined;
  }

  const payload = readStatePayload(encodedPayload);
  if (!payload) {
    return undefined;
  }

  const issuedAt = Date.parse(payload.issuedAt);
  if (!Number.isFinite(issuedAt)) {
    return undefined;
  }

  const now = options.now?.getTime() ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  return issuedAt <= now && now - issuedAt <= maxAgeMs ? payload : undefined;
}

function signStatePayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function readStatePayload(encodedPayload: string): GitHubAppCallbackStatePayload | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<GitHubAppCallbackStatePayload>;
    return typeof parsed.issuedAt === "string" && typeof parsed.nonce === "string" ? parsed as GitHubAppCallbackStatePayload : undefined;
  } catch {
    return undefined;
  }
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
