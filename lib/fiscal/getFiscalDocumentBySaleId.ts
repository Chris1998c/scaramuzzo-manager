import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { FiscalDocumentView } from "@/lib/fiscal/fiscalDocumentTypes";

export async function getFiscalDocumentBySaleId(
  saleId: number,
): Promise<{
  fiscal_status: string | null;
  document: FiscalDocumentView | null;
}> {
  const { data: saleRow, error: saleErr } = await supabaseAdmin
    .from("sales")
    .select("id, fiscal_status")
    .eq("id", saleId)
    .maybeSingle();

  if (saleErr) throw saleErr;
  if (!saleRow) {
    return { fiscal_status: null, document: null };
  }

  const fiscal_status =
    String((saleRow as { fiscal_status?: unknown }).fiscal_status ?? "").trim() ||
    "pending";

  const { data: docRows, error: docErr } = await supabaseAdmin
    .from("fiscal_documents")
    .select(
      `
      id,
      document_type,
      fiscal_receipt_number,
      z_rep_number,
      printer_serial,
      receipt_iso_datetime,
      fiscal_receipt_date,
      fiscal_receipt_time,
      fiscal_receipt_amount,
      fiscal_print_job_id,
      created_at,
      fiscal_print_jobs ( status )
    `,
    )
    .eq("sale_id", saleId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (docErr) throw docErr;

  const raw = (docRows ?? [])[0] as Record<string, unknown> | undefined;
  if (!raw) {
    return { fiscal_status, document: null };
  }

  const job = raw.fiscal_print_jobs as { status?: unknown } | null;
  const amountRaw = raw.fiscal_receipt_amount;
  const amount =
    amountRaw == null || amountRaw === ""
      ? null
      : Number.isFinite(Number(amountRaw))
        ? Number(amountRaw)
        : null;

  const document: FiscalDocumentView = {
    id: Number(raw.id),
    document_type: String(raw.document_type ?? ""),
    fiscal_receipt_number:
      raw.fiscal_receipt_number != null
        ? String(raw.fiscal_receipt_number)
        : null,
    z_rep_number:
      raw.z_rep_number != null ? String(raw.z_rep_number) : null,
    printer_serial:
      raw.printer_serial != null ? String(raw.printer_serial) : null,
    receipt_iso_datetime:
      raw.receipt_iso_datetime != null
        ? String(raw.receipt_iso_datetime)
        : null,
    fiscal_receipt_date:
      raw.fiscal_receipt_date != null ? String(raw.fiscal_receipt_date) : null,
    fiscal_receipt_time:
      raw.fiscal_receipt_time != null ? String(raw.fiscal_receipt_time) : null,
    fiscal_receipt_amount: amount,
    fiscal_print_job_id: Number(raw.fiscal_print_job_id),
    job_status: job?.status != null ? String(job.status) : null,
    created_at: raw.created_at != null ? String(raw.created_at) : null,
  };

  return { fiscal_status, document };
}
