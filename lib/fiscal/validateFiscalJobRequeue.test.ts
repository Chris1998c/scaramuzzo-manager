import { describe, expect, it } from "vitest";
import { validateRequeueFiscalJob } from "@/lib/fiscal/validateFiscalJobRequeue";
import type { FiscalPrintJobActionRecord } from "@/lib/fiscal/fetchFiscalPrintJobById";

function job(
  partial: Partial<FiscalPrintJobActionRecord>,
): FiscalPrintJobActionRecord {
  return {
    id: 1,
    salon_id: 1,
    kind: "sale_receipt",
    status: "failed",
    locked_at: null,
    sale_id: 10,
    cash_session_id: null,
    error_message: null,
    ...partial,
  };
}

describe("validateRequeueFiscalJob", () => {
  it("blocca failed con reconcile_required", () => {
    const r = validateRequeueFiscalJob(
      job({ error_message: "[reconcile_required] verificare stampante" }),
      { confirmZReport: false },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.message).toMatch(/Riconciliazione/i);
    }
  });

  it("consente failed ordinario", () => {
    const r = validateRequeueFiscalJob(
      job({ error_message: "FPMate timeout pre-SOAP" }),
      { confirmZReport: false },
    );
    expect(r.ok).toBe(true);
  });

  it("blocca processing", () => {
    const r = validateRequeueFiscalJob(job({ status: "processing" }), {
      confirmZReport: false,
    });
    expect(r.ok).toBe(false);
  });
});
