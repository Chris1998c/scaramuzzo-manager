import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica X-Hub-Signature-256 Meta sul body grezzo (App Secret).
 * Header atteso: sha256=<hex>
 */
export function verifyWhatsAppWebhookSignature(params: {
  rawBody: Buffer | Uint8Array | string;
  signatureHeader: string | null | undefined;
  appSecret: string;
}): boolean {
  const secret = params.appSecret.trim();
  const header = String(params.signatureHeader ?? "").trim();
  if (!secret || !header) return false;

  const prefix = "sha256=";
  if (!header.startsWith(prefix)) return false;
  const providedHex = header.slice(prefix.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(providedHex)) return false;

  const raw =
    typeof params.rawBody === "string"
      ? Buffer.from(params.rawBody, "utf8")
      : Buffer.from(params.rawBody);

  const expectedHex = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(providedHex, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyWhatsAppWebhookChallenge(params: {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
  expectedVerifyToken: string;
}): { ok: true; challenge: string } | { ok: false } {
  const expected = params.expectedVerifyToken.trim();
  if (!expected) return { ok: false };
  if (params.mode !== "subscribe") return { ok: false };
  if (!params.verifyToken || params.verifyToken !== expected) return { ok: false };
  if (params.challenge == null || params.challenge === "") return { ok: false };
  return { ok: true, challenge: params.challenge };
}
