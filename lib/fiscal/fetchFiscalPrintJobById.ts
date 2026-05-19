import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type FiscalPrintJobActionRecord = {
  id: number;
  salon_id: number;
  kind: string;
  status: string;
  locked_at: string | null;
  sale_id: number | null;
  cash_session_id: number | null;
};

export async function fetchFiscalPrintJobById(
  jobId: number,
): Promise<FiscalPrintJobActionRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("fiscal_print_jobs")
    .select("id, salon_id, kind, status, locked_at, sale_id, cash_session_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const raw = data as Record<string, unknown>;
  return {
    id: Number(raw.id),
    salon_id: Number(raw.salon_id),
    kind: String(raw.kind ?? ""),
    status: String(raw.status ?? ""),
    locked_at: raw.locked_at != null ? String(raw.locked_at) : null,
    sale_id: raw.sale_id != null ? Number(raw.sale_id) : null,
    cash_session_id:
      raw.cash_session_id != null ? Number(raw.cash_session_id) : null,
  };
}
