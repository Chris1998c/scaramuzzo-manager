import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SystemLogInsert = {
  userId?: string | null;
  salonId?: number | null;
  action: string;
  tableName: string;
  referenceId?: string | null;
  payload?: Record<string, unknown> | null;
};

/** Best-effort insert into public.system_log (service_role). */
export async function writeSystemLog(entry: SystemLogInsert): Promise<void> {
  const { error } = await supabaseAdmin.from("system_log").insert({
    user_id: entry.userId ?? null,
    salon_id: entry.salonId ?? null,
    action: entry.action,
    table_name: entry.tableName,
    reference_id: entry.referenceId ?? null,
    payload: entry.payload ?? null,
  });
  if (error) {
    console.error("[system_log]", entry.action, error.message);
  }
}
