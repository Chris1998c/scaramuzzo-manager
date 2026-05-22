import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FISCAL_HEALTH_THRESHOLDS } from "@/lib/fiscal/fiscalHealthConstants";
import type { FiscalPrintJobDashboardRow } from "@/lib/fiscal/fetchFiscalPrintJobsDashboard";
import { fetchFiscalPrintJobsDashboard } from "@/lib/fiscal/fetchFiscalPrintJobsDashboard";
import {
  isReconcileRequiredJob,
  listCriticalFiscalJobs,
} from "@/lib/fiscal/fiscalJobCriticalList";
import type {
  BridgeFiscalSnapshot,
  BridgeLastJobSummary,
} from "@/lib/bridge/bridgeFiscalTypes";

export type { BridgeFiscalSnapshot, BridgeLastJobSummary } from "@/lib/bridge/bridgeFiscalTypes";
export { mergeHealthReconcileCount } from "@/lib/bridge/bridgeFiscalTypes";

function romeTodayBounds(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  const day = `${y}-${m}-${d}`;
  return {
    start: `${day}T00:00:00+01:00`,
    end: `${day}T23:59:59.999+01:00`,
  };
}

function toLastJobSummary(row: FiscalPrintJobDashboardRow): BridgeLastJobSummary {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    created_at: row.created_at,
    completed_at: row.completed_at,
    error_message: row.error_message,
    sale_id: row.sale_id,
    document_id: row.document?.id ?? null,
  };
}

async function fetchLastJobByKind(
  salonId: number,
  kind: "sale_receipt" | "void_receipt" | "z_report",
): Promise<BridgeLastJobSummary | null> {
  const { data, error } = await supabaseAdmin
    .from("fiscal_print_jobs")
    .select(
      "id, created_at, completed_at, kind, status, sale_id, error_message, fiscal_documents ( id )",
    )
    .eq("salon_id", salonId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const docs = data.fiscal_documents as { id?: number } | { id?: number }[] | null;
  const doc0 = Array.isArray(docs) ? docs[0] : docs;
  return {
    id: Number(data.id),
    kind: String(data.kind),
    status: String(data.status),
    created_at: String(data.created_at),
    completed_at: data.completed_at != null ? String(data.completed_at) : null,
    error_message: data.error_message != null ? String(data.error_message) : null,
    sale_id: data.sale_id != null ? Number(data.sale_id) : null,
    document_id: doc0?.id != null ? Number(doc0.id) : null,
  };
}

export async function fetchBridgeFiscalSnapshot(
  salonId: number,
): Promise<BridgeFiscalSnapshot> {
  const emptyKinds = {
    sale_receipt: null,
    void_receipt: null,
    z_report: null,
  };

  const [{ rows: recentJobs }, pendingRes, processingRes, failedRes] = await Promise.all([
    fetchFiscalPrintJobsDashboard({ salonId, status: null, kind: null, limit: 80 }),
    supabaseAdmin
      .from("fiscal_print_jobs")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salonId)
      .eq("status", "pending"),
    supabaseAdmin
      .from("fiscal_print_jobs")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salonId)
      .eq("status", "processing"),
    supabaseAdmin
      .from("fiscal_print_jobs")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salonId)
      .eq("status", "failed"),
  ]);

  const critical_jobs = listCriticalFiscalJobs(recentJobs);
  const reconcile_required = critical_jobs.filter((j) =>
    isReconcileRequiredJob(j),
  ).length;

  const { start, end } = romeTodayBounds();
  const { data: zToday } = await supabaseAdmin
    .from("fiscal_print_jobs")
    .select("id")
    .eq("salon_id", salonId)
    .eq("kind", "z_report")
    .eq("status", "completed")
    .gte("completed_at", start)
    .lte("completed_at", end)
    .limit(1);

  const { data: lastDoc } = await supabaseAdmin
    .from("fiscal_documents")
    .select("id, document_type, fiscal_receipt_number, z_rep_number, created_at, sale_id")
    .eq("salon_id", salonId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [sale, voidJob, zJob] = await Promise.all([
    fetchLastJobByKind(salonId, "sale_receipt"),
    fetchLastJobByKind(salonId, "void_receipt"),
    fetchLastJobByKind(salonId, "z_report"),
  ]);

  return {
    counts: {
      pending: pendingRes.count ?? 0,
      processing: processingRes.count ?? 0,
      failed: failedRes.count ?? 0,
      reconcile_required,
    },
    last_by_kind: {
      sale_receipt: sale,
      void_receipt: voidJob,
      z_report: zJob,
    },
    last_fiscal_document: lastDoc
      ? {
          id: Number(lastDoc.id),
          document_type: String(lastDoc.document_type),
          fiscal_receipt_number:
            lastDoc.fiscal_receipt_number != null
              ? String(lastDoc.fiscal_receipt_number)
              : null,
          z_rep_number:
            lastDoc.z_rep_number != null ? String(lastDoc.z_rep_number) : null,
          created_at: String(lastDoc.created_at),
          sale_id: lastDoc.sale_id != null ? Number(lastDoc.sale_id) : null,
        }
      : null,
    z_report_completed_today: (zToday?.length ?? 0) > 0,
    critical_jobs: critical_jobs.slice(0, 25),
  };
}

export { FISCAL_HEALTH_THRESHOLDS };
