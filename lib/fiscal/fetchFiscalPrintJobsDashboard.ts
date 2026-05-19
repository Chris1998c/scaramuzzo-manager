import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type FiscalJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type FiscalJobKind = "sale_receipt" | "void_receipt" | "z_report";

export type FiscalPrintJobDashboardRow = {
  id: number;
  created_at: string;
  salon_id: number;
  kind: string;
  status: string;
  sale_id: number | null;
  cash_session_id: number | null;
  attempts: number | null;
  error_message: string | null;
  locked_at: string | null;
  completed_at: string | null;
  document: {
    id: number;
    document_type: string;
    fiscal_receipt_number: string | null;
    z_rep_number: string | null;
    printer_serial: string | null;
  } | null;
};

export type FetchFiscalPrintJobsParams = {
  salonId: number | null;
  status: FiscalJobStatus | null;
  kind: FiscalJobKind | null;
  limit?: number;
};

const JOB_SELECT = `
  id,
  created_at,
  salon_id,
  kind,
  status,
  sale_id,
  cash_session_id,
  attempts,
  error_message,
  locked_at,
  completed_at,
  fiscal_documents (
    id,
    document_type,
    fiscal_receipt_number,
    z_rep_number,
    printer_serial
  )
`;

function mapRow(raw: Record<string, unknown>): FiscalPrintJobDashboardRow {
  const docsRaw = raw.fiscal_documents;
  const docArr = Array.isArray(docsRaw)
    ? docsRaw
    : docsRaw && typeof docsRaw === "object"
      ? [docsRaw]
      : [];
  const doc0 = (docArr[0] ?? null) as Record<string, unknown> | null;

  return {
    id: Number(raw.id),
    created_at: String(raw.created_at ?? ""),
    salon_id: Number(raw.salon_id),
    kind: String(raw.kind ?? ""),
    status: String(raw.status ?? ""),
    sale_id: raw.sale_id != null ? Number(raw.sale_id) : null,
    cash_session_id:
      raw.cash_session_id != null ? Number(raw.cash_session_id) : null,
    attempts: raw.attempts != null ? Number(raw.attempts) : null,
    error_message:
      raw.error_message != null ? String(raw.error_message) : null,
    locked_at: raw.locked_at != null ? String(raw.locked_at) : null,
    completed_at:
      raw.completed_at != null ? String(raw.completed_at) : null,
    document: doc0
      ? {
          id: Number(doc0.id),
          document_type: String(doc0.document_type ?? ""),
          fiscal_receipt_number:
            doc0.fiscal_receipt_number != null
              ? String(doc0.fiscal_receipt_number)
              : null,
          z_rep_number:
            doc0.z_rep_number != null ? String(doc0.z_rep_number) : null,
          printer_serial:
            doc0.printer_serial != null ? String(doc0.printer_serial) : null,
        }
      : null,
  };
}

export async function fetchFiscalPrintJobsDashboard(
  params: FetchFiscalPrintJobsParams,
): Promise<{ rows: FiscalPrintJobDashboardRow[]; error: string | null }> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);

  if (params.salonId === -1) {
    return { rows: [], error: null };
  }

  let q = supabaseAdmin
    .from("fiscal_print_jobs")
    .select(JOB_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.salonId != null && params.salonId > 0) {
    q = q.eq("salon_id", params.salonId);
  }
  if (params.status) {
    q = q.eq("status", params.status);
  }
  if (params.kind) {
    q = q.eq("kind", params.kind);
  }

  const { data, error } = await q;

  if (error) {
    return { rows: [], error: error.message };
  }

  return {
    rows: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)),
    error: null,
  };
}
