import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

interface CreateGitHubAppCallbackStateOptions {
  issuedAt?: Date;
  nonce?: string;
}

interface VerifyGitHubAppCallbackStateOptions {
  maxAgeMs?: number;
  now?: Date;
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

export function verifyGitHubAppCallbackState(
  state: string,
  secret: string,
  options: VerifyGitHubAppCallbackStateOptions = {}
): boolean {
  const [encodedPayload, signature, extra] = state.split(".");
  if (!encodedPayload || !signature || extra) {
    return false;
  }

  const expectedSignature = signStatePayload(encodedPayload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) {
    return false;
  }

  const payload = readStatePayload(encodedPayload);
  if (!payload) {
    return false;
  }

  const issuedAt = Date.parse(payload.issuedAt);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  const now = options.now?.getTime() ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  return issuedAt <= now && now - issuedAt <= maxAgeMs;
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
