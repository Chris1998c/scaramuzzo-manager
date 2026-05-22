import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { BRIDGE_TOKEN_PREFIX } from "@/lib/bridge/bridgeConstants";

const TOKEN_BYTES = 32;

export function getBridgeTokenPepper(): string {
  return (
    process.env.BRIDGE_TOKEN_HASH_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "dev-bridge-token-pepper-change-in-production"
  );
}

/** SHA-256(pepper + token) — mai salvare il token in chiaro. */
export function hashBridgeToken(plainToken: string, pepper = getBridgeTokenPepper()): string {
  return createHash("sha256")
    .update(`${pepper}:${plainToken}`, "utf8")
    .digest("hex");
}

export function tokenPrefixForDisplay(plainToken: string): string {
  const t = String(plainToken || "");
  return t.length <= 12 ? t : `${t.slice(0, 12)}…`;
}

export function generateBridgeToken(): { plain: string; hash: string; prefix: string } {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const plain = `${BRIDGE_TOKEN_PREFIX}${raw}`;
  return {
    plain,
    hash: hashBridgeToken(plain),
    prefix: tokenPrefixForDisplay(plain),
  };
}

export function verifyBridgeTokenHash(
  plainToken: string,
  expectedHash: string,
  pepper = getBridgeTokenPepper(),
): boolean {
  const a = Buffer.from(hashBridgeToken(plainToken, pepper), "utf8");
  const b = Buffer.from(String(expectedHash || ""), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
