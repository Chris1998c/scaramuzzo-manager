import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BridgeInstallationRecord } from "@/lib/bridge/processBridgeHeartbeat";

export type BridgeJobAuditAction =
  | "claim"
  | "finalize_success"
  | "finalize_failed"
  | "requeue"
  | "reconcile";

export async function logBridgeJobEvent(
  installation: BridgeInstallationRecord,
  action: BridgeJobAuditAction,
  opts: {
    job_id?: number | null;
    payload?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const { error } = await supabaseAdmin.from("bridge_job_events").insert({
    bridge_installation_id: installation.id,
    bridge_id: installation.bridge_id,
    salon_id: installation.salon_id,
    job_id: opts.job_id ?? null,
    action,
    payload: opts.payload ?? {},
  });

  if (error) {
    console.error("[bridge] job event audit", action, error);
  }
}
