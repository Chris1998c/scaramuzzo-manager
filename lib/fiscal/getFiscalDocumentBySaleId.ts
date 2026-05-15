import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  FiscalDocumentView,
  VoidVoidJobInfo,
} from "@/lib/fiscal/fiscalDocumentTypes";

export async function getFiscalDocumentBySaleId(
  saleId: number,
): Promise<{
  fiscal_status: string | null;
  sale_status: string | null;
  document: FiscalDocumentView | null;
  void_void_job: VoidVoidJobInfo | null;
}> {
  const { data: saleRow, error: saleErr } = await supabaseAdmin
    .from("sales")
    .select("id, fiscal_status, status")
    .eq("id", saleId)
    .maybeSingle();

  if (saleErr) throw saleErr;
  if (!saleRow) {
    return {
      fiscal_status: null,
      sale_status: null,
      document: null,
      void_void_job: null,
    };
  }

  const fiscal_status =
    String((saleRow as { fiscal_status?: unknown }).fiscal_status ?? "").trim() ||
    "pending";
  const sale_status = String(
    (saleRow as { status?: unknown }).status ?? "posted",
  ).trim();

  const { data: voidJobRows, error: voidJobErr } = await supabaseAdmin
    .from("fiscal_print_jobs")
    .select("id, status")
    .eq("sale_id", saleId)
    .eq("kind", "void_receipt")
    .in("status", ["pending", "processing", "completed"])
    .order("id", { ascending: false })
    .limit(1);

  if (voidJobErr) throw voidJobErr;

  let void_void_job: VoidVoidJobInfo | null = null;
  const voidRaw = (voidJobRows ?? [])[0] as
    | { id?: unknown; status?: unknown }
    | undefined;
  if (voidRaw?.id != null) {
    void_void_job = {
      job_id: Number(voidRaw.id),
      status: String(voidRaw.status ?? "pending"),
    };
  }

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
    .eq("document_type", "sale_receipt")
    .order("created_at", { ascending: false })
    .limit(1);

  if (docErr) throw docErr;

  const raw = (docRows ?? [])[0] as Record<string, unknown> | undefined;
  if (!raw) {
    return { fiscal_status, sale_status, document: null, void_void_job };
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

  return { fiscal_status, sale_status, document, void_void_job };
}
