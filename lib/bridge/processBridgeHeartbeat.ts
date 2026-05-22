import {
  normalizeAndSanitizeHeartbeatPayload,
  type BridgeHeartbeatInput,
} from "@/lib/bridge/sanitizeBridgeHealth";
import { isValidBridgeSalonId } from "@/lib/bridge/bridgeWebAccess";

export type BridgeInstallationRecord = {
  id: string;
  bridge_id: string;
  salon_id: number;
  revoked_at: string | null;
};

export type ProcessHeartbeatResult =
  | {
      ok: true;
      status: string;
      installation_id: string;
      flags: { tenant_ready: boolean };
    }
  | { ok: false; status: number; error: string };

export function deriveBridgeStatusFromHealth(
  health: Record<string, unknown>,
  onlineFlag: boolean,
): string {
  if (!onlineFlag) return "offline";
  const fpmate = health.fpmate_reachable;
  const supa = health.supabase_reachable;
  if (fpmate === false || supa === false) return "degraded";
  return "online";
}

export function validateHeartbeatAgainstInstallation(
  installation: BridgeInstallationRecord,
  body: BridgeHeartbeatInput,
): { ok: true } | { ok: false; error: string } {
  if (installation.revoked_at) {
    return { ok: false, error: "installation_revoked" };
  }
  if (body.bridge_id && body.bridge_id !== installation.bridge_id) {
    return { ok: false, error: "bridge_id_mismatch" };
  }
  if (
    body.salon_id != null &&
    Number(body.salon_id) !== installation.salon_id
  ) {
    return { ok: false, error: "salon_id_mismatch" };
  }
  if (body.salon_id != null && !isValidBridgeSalonId(Number(body.salon_id))) {
    return { ok: false, error: "invalid_salon_id" };
  }
  return { ok: true };
}

export function buildHeartbeatUpdate(
  installation: BridgeInstallationRecord,
  body: BridgeHeartbeatInput,
): {
  last_health: Record<string, unknown>;
  status: string;
  version: string | null;
  last_seen_at: string;
} {
  const last_health = normalizeAndSanitizeHeartbeatPayload(body);
  const status = deriveBridgeStatusFromHealth(
    last_health,
    body.online !== false,
  );
  const version =
    typeof body.version === "string" ? body.version.slice(0, 64) : null;
  return {
    last_health,
    status,
    version,
    last_seen_at: new Date().toISOString(),
  };
}

export function processBridgeHeartbeatSuccess(
  installation: BridgeInstallationRecord,
  body: BridgeHeartbeatInput,
): ProcessHeartbeatResult {
  const v = validateHeartbeatAgainstInstallation(installation, body);
  if (!v.ok) {
    return { ok: false, status: 403, error: v.error };
  }
  return {
    ok: true,
    status: deriveBridgeStatusFromHealth(
      normalizeAndSanitizeHeartbeatPayload(body),
      body.online !== false,
    ),
    installation_id: installation.id,
    flags: { tenant_ready: true },
  };
}
