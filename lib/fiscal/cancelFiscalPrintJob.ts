import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type CancelFiscalPrintJobRpcResult =
  | { ok: true; job: Record<string, unknown> }
  | { ok: false; status: number; message: string };

function mapRpcJobRow(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return {};
}

/**
 * Annullamento via RPC cancel_fiscal_print_job (SECURITY DEFINER, service_role).
 */
export async function cancelFiscalPrintJobViaRpc(
  jobId: number,
  reason?: string | null,
): Promise<CancelFiscalPrintJobRpcResult> {
  const { data, error } = await supabaseAdmin.rpc("cancel_fiscal_print_job", {
    p_job_id: jobId,
    p_reason: reason?.trim() || "dashboard",
  });

  if (error) {
    const msg = error.message ?? "Errore annullamento job fiscale";
    if (/non trovato/i.test(msg)) {
      return { ok: false, status: 404, message: msg };
    }
    if (/ancora in lavorazione|non annullabile|non cancel|non supportato/i.test(msg)) {
      return { ok: false, status: 409, message: msg };
    }
    return { ok: false, status: 500, message: msg };
  }

  const row = Array.isArray(data) && data.length > 0 ? data[0] : data;
  if (!row) {
    return {
      ok: false,
      status: 500,
      message: "Job non restituito dalla RPC cancel_fiscal_print_job",
    };
  }

  return { ok: true, job: mapRpcJobRow(row) };
}
