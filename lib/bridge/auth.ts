import "server-only";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashBridgeToken, parseBearerToken, verifyBridgeTokenHash } from "@/lib/bridge/bridgeToken";
import type { BridgeInstallationRecord } from "@/lib/bridge/processBridgeHeartbeat";

export type { BridgeContextInput } from "@/lib/bridge/bridgeJobContext";
export { assertBridgeContext } from "@/lib/bridge/bridgeJobContext";

export type BridgeTokenAuth = {
  token_id: string;
  installation: BridgeInstallationRecord;
};

export type BridgeAuthResult =
  | { ok: true; auth: BridgeTokenAuth }
  | { ok: false; status: number; error: string };

/** Estrae Bearer token dall'header Authorization. */
export function resolveBridgeToken(headers: Headers): string | null {
  return parseBearerToken(headers.get("authorization"));
}

export function resolveBridgeTokenFromRequest(req: Request): string | null {
  return resolveBridgeToken(req.headers);
}

/** Verifica hash token (testabile senza DB). */
export function verifyBridgeTokenAgainstHash(
  plainToken: string,
  tokenHash: string,
): boolean {
  return verifyBridgeTokenHash(plainToken, tokenHash);
}

function tokenNotActive(
  row: { revoked_at: string | null; expires_at: string | null },
  nowIso: string,
): string | null {
  if (row.revoked_at) return "token_revoked";
  if (row.expires_at && row.expires_at < nowIso) return "token_expired";
  return null;
}

/** Lookup token hash, revoke/expiry, installation attiva. */
export async function authenticateBridgeBearer(
  plainToken: string,
): Promise<BridgeAuthResult> {
  const hash = hashBridgeToken(plainToken);
  const now = new Date().toISOString();

  const { data: tokenRow, error } = await supabaseAdmin
    .from("bridge_tokens")
    .select(
      "id, revoked_at, expires_at, bridge_installation_id, bridge_installations ( id, bridge_id, salon_id, revoked_at )",
    )
    .eq("token_hash", hash)
    .maybeSingle();

  if (error) {
    console.error("[bridge] token lookup", error);
    return { ok: false, status: 500, error: "token_lookup_failed" };
  }
  if (!tokenRow) {
    return { ok: false, status: 401, error: "invalid_token" };
  }

  const tokenBlock = tokenNotActive(tokenRow, now);
  if (tokenBlock) {
    return { ok: false, status: 401, error: tokenBlock };
  }

  const rawInst = tokenRow.bridge_installations as
    | BridgeInstallationRecord
    | BridgeInstallationRecord[]
    | null;
  const inst = Array.isArray(rawInst) ? rawInst[0] ?? null : rawInst;
  if (!inst) {
    return { ok: false, status: 401, error: "installation_missing" };
  }
  if (inst.revoked_at) {
    return { ok: false, status: 401, error: "installation_revoked" };
  }

  await supabaseAdmin
    .from("bridge_tokens")
    .update({ last_used_at: now })
    .eq("id", tokenRow.id);

  return {
    ok: true,
    auth: { token_id: tokenRow.id, installation: inst },
  };
}

/** Auth obbligatoria: 401 JSON se token assente/invalido. */
export async function requireBridgeAuth(
  req: Request,
): Promise<BridgeAuthResult | NextResponse> {
  const plain = resolveBridgeTokenFromRequest(req);
  if (!plain) {
    return NextResponse.json({ ok: false, error: "missing_bearer_token" }, { status: 401 });
  }
  const auth = await authenticateBridgeBearer(plain);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  return auth;
}

export function isBridgeAuthResult(
  value: BridgeAuthResult | NextResponse,
): value is BridgeAuthResult {
  return "ok" in value && typeof (value as BridgeAuthResult).ok === "boolean";
}
