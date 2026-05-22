import type { CriticalFiscalJob } from "@/lib/fiscal/fiscalJobCriticalList";

export type BridgeLastJobSummary = {
  id: number;
  kind: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  sale_id: number | null;
  document_id: number | null;
};

export type BridgeFiscalSnapshot = {
  counts: {
    pending: number;
    processing: number;
    failed: number;
    reconcile_required: number;
  };
  last_by_kind: {
    sale_receipt: BridgeLastJobSummary | null;
    void_receipt: BridgeLastJobSummary | null;
    z_report: BridgeLastJobSummary | null;
  };
  last_fiscal_document: {
    id: number;
    document_type: string;
    fiscal_receipt_number: string | null;
    z_rep_number: string | null;
    created_at: string;
    sale_id: number | null;
  } | null;
  z_report_completed_today: boolean;
  critical_jobs: CriticalFiscalJob[];
};

export function mergeHealthReconcileCount(
  health: Record<string, unknown>,
  dbReconcileCount: number,
): number {
  const fromHealth =
    typeof health.reconcile_required === "number" && Number.isFinite(health.reconcile_required)
      ? Math.max(0, Math.trunc(health.reconcile_required))
      : 0;
  return Math.max(fromHealth, dbReconcileCount);
}
