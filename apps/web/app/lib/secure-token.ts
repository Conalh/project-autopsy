import { createHash, timingSafeEqual } from "node:crypto";

export function verifySecretToken(requestToken: string | undefined, configuredToken: string): boolean {
  if (!requestToken) {
    return false;
  }

  return timingSafeEqual(tokenDigest(requestToken), tokenDigest(configuredToken));
}

function tokenDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
