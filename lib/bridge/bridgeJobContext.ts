import type { BridgeInstallationRecord } from "@/lib/bridge/processBridgeHeartbeat";
import { isValidBridgeSalonId } from "@/lib/bridge/bridgeWebAccess";

export type BridgeContextInput = {
  bridge_id?: string | null;
  salon_id?: number | string | null;
};

/** Coerenza bridge_id / salon_id nel body con installation del token. */
export function assertBridgeContext(
  installation: BridgeInstallationRecord,
  ctx: BridgeContextInput,
): { ok: true } | { ok: false; status: number; error: string } {
  if (installation.revoked_at) {
    return { ok: false, status: 401, error: "installation_revoked" };
  }
  if (ctx.bridge_id != null && String(ctx.bridge_id).trim() !== installation.bridge_id) {
    return { ok: false, status: 403, error: "bridge_id_mismatch" };
  }
  if (ctx.salon_id != null) {
    const sid = Number(ctx.salon_id);
    if (!Number.isFinite(sid) || !isValidBridgeSalonId(sid)) {
      return { ok: false, status: 400, error: "invalid_salon_id" };
    }
    if (sid !== installation.salon_id) {
      return { ok: false, status: 403, error: "salon_id_mismatch" };
    }
  }
  return { ok: true };
}
