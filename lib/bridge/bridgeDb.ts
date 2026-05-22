import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashBridgeToken, generateBridgeToken } from "@/lib/bridge/bridgeToken";
import {
  buildHeartbeatUpdate,
  type BridgeInstallationRecord,
} from "@/lib/bridge/processBridgeHeartbeat";
import type { BridgeHeartbeatInput } from "@/lib/bridge/sanitizeBridgeHealth";
import { resolveTenantIdForBridge } from "@/lib/bridge/tenantFoundation";
import { isValidBridgeSalonId } from "@/lib/bridge/bridgeWebAccess";

export type BridgeTokenAuthRow = {
  token_id: string;
  installation: BridgeInstallationRecord;
};

export async function authenticateBridgeBearer(
  plainToken: string,
): Promise<
  | { ok: true; auth: BridgeTokenAuthRow }
  | { ok: false; status: number; error: string }
> {
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
  if (tokenRow.revoked_at) {
    return { ok: false, status: 401, error: "token_revoked" };
  }
  if (tokenRow.expires_at && tokenRow.expires_at < now) {
    return { ok: false, status: 401, error: "token_expired" };
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

export async function applyBridgeHeartbeat(
  installation: BridgeInstallationRecord,
  body: BridgeHeartbeatInput,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const update = buildHeartbeatUpdate(installation, body);
  const { error } = await supabaseAdmin
    .from("bridge_installations")
    .update({
      last_seen_at: update.last_seen_at,
      last_health: update.last_health,
      status: update.status,
      version: update.version,
      updated_at: new Date().toISOString(),
    })
    .eq("id", installation.id);

  if (error) {
    console.error("[bridge] heartbeat update", error);
    return { ok: false, status: 500, error: "update_failed" };
  }

  const { error: histErr } = await supabaseAdmin.from("bridge_heartbeats").insert({
    bridge_installation_id: installation.id,
    salon_id: installation.salon_id,
    bridge_id: installation.bridge_id,
    status: update.status,
    version: update.version,
    health: update.last_health,
  });

  if (histErr) {
    console.error("[bridge] heartbeat history insert", histErr);
    return { ok: false, status: 500, error: "history_insert_failed" };
  }

  return { ok: true };
}

export type BridgeHeartbeatHistoryRow = {
  id: string;
  created_at: string;
  status: string | null;
  version: string | null;
  health: Record<string, unknown>;
};

export async function fetchBridgeHeartbeatHistory(
  installationId: string,
  limit = 20,
): Promise<BridgeHeartbeatHistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from("bridge_heartbeats")
    .select("id, created_at, status, version, health")
    .eq("bridge_installation_id", installationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    created_at: String(r.created_at),
    status: r.status != null ? String(r.status) : null,
    version: r.version != null ? String(r.version) : null,
    health: (r.health ?? {}) as Record<string, unknown>,
  }));
}

export async function fetchBridgeInstallationsForDashboard(salonId: number | null) {
  let q = supabaseAdmin
    .from("bridge_installations")
    .select(
      "id, tenant_id, salon_id, bridge_id, name, status, version, last_seen_at, last_health, revoked_at, salons ( name )",
    )
    .order("salon_id", { ascending: true });

  if (salonId != null) {
    q = q.eq("salon_id", salonId);
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const salons = row.salons as { name?: string } | { name?: string }[] | null;
    const salonName = Array.isArray(salons)
      ? salons[0]?.name
      : salons?.name ?? null;
    const { salons: _s, ...rest } = row;
    return {
      ...rest,
      last_health: (rest.last_health ?? {}) as Record<string, unknown>,
      salon_name: salonName ?? null,
    };
  });
}

export async function createBridgeInstallation(input: {
  bridge_id: string;
  salon_id: number;
  name?: string | null;
}) {
  if (!isValidBridgeSalonId(input.salon_id)) {
    return { ok: false as const, status: 400, error: "salon_id must be 1-4" };
  }
  const tenant_id = resolveTenantIdForBridge();
  const { data, error } = await supabaseAdmin
    .from("bridge_installations")
    .insert({
      bridge_id: input.bridge_id.trim(),
      salon_id: input.salon_id,
      name: input.name?.trim() || null,
      tenant_id,
      status: "unknown",
    })
    .select("id, bridge_id, salon_id, name, status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false as const, status: 409, error: "bridge_id already exists" };
    }
    throw error;
  }
  return { ok: true as const, installation: data };
}

export async function mintBridgeTokenForInstallation(installationId: string) {
  const { data: inst, error: instErr } = await supabaseAdmin
    .from("bridge_installations")
    .select("id, bridge_id, revoked_at")
    .eq("id", installationId)
    .maybeSingle();

  if (instErr) throw instErr;
  if (!inst) return { ok: false as const, status: 404, error: "installation not found" };
  if (inst.revoked_at) {
    return { ok: false as const, status: 400, error: "installation revoked" };
  }

  const { plain, hash, prefix } = generateBridgeToken();
  const { data: tokenRow, error } = await supabaseAdmin
    .from("bridge_tokens")
    .insert({
      bridge_installation_id: installationId,
      token_hash: hash,
      token_prefix: prefix,
    })
    .select("id, token_prefix, created_at")
    .single();

  if (error) throw error;

  return {
    ok: true as const,
    token: plain,
    token_meta: tokenRow,
    bridge_id: inst.bridge_id,
  };
}

export async function revokeBridgeToken(tokenId: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("bridge_tokens")
    .update({ revoked_at: now })
    .eq("id", tokenId)
    .select("id, bridge_installation_id, revoked_at")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false as const, status: 404, error: "token not found" };
  return { ok: true as const, token: data };
}

export async function listBridgeTokensForInstallation(installationId: string) {
  const { data, error } = await supabaseAdmin
    .from("bridge_tokens")
    .select("id, token_prefix, created_at, last_used_at, revoked_at, expires_at")
    .eq("bridge_installation_id", installationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
