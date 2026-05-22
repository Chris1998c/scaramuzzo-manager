import { describe, expect, it } from "vitest";

import {
  classifyCriticalJob,
  isReconcileRequiredJob,
  listCriticalFiscalJobs,
  canManualRequeueJob,
} from "@/lib/fiscal/fiscalJobCriticalList";
import type { FiscalPrintJobDashboardRow } from "@/lib/fiscal/fetchFiscalPrintJobsDashboard";

function job(partial: Partial<FiscalPrintJobDashboardRow>): FiscalPrintJobDashboardRow {
  return {
    id: 1,
    created_at: new Date().toISOString(),
    salon_id: 1,
    kind: "sale_receipt",
    status: "failed",
    sale_id: 10,
    cash_session_id: null,
    attempts: 1,
    error_message: null,
    locked_at: null,
    completed_at: null,
    document: null,
    ...partial,
  };
}

describe("fiscalJobCriticalList", () => {
  it("rileva reconcile da error_message", () => {
    expect(
      isReconcileRequiredJob(
        job({ error_message: "Richiede riconciliazione manuale stampante" }),
      ),
    ).toBe(true);
  });

  it("lista failed e reconcile", () => {
    const list = listCriticalFiscalJobs([
      job({ status: "failed", error_message: "reconcile needed" }),
      job({ id: 2, status: "completed" }),
    ]);
    expect(list.length).toBe(1);
    expect(list[0].category).toBe("reconcile_required");
  });

  it("blocca requeue su processing", () => {
    const r = canManualRequeueJob(
      job({ status: "processing", locked_at: new Date().toISOString() }),
      true,
    );
    expect(r.allowed).toBe(false);
  });

  it("pending stale oltre soglia", () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(classifyCriticalJob(job({ status: "pending", created_at: old }))).toBe(
      "pending_stale",
    );
  });
});
