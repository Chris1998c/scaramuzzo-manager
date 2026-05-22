import { describe, expect, it } from "vitest";

import {
  assertBridgeJobSalonOwnership,
  validateBridgeRequeueGate,
  type BridgeFiscalJobOwnership,
} from "@/lib/bridge/bridgeJobValidation";

const installation = {
  id: "uuid",
  bridge_id: "roma_1",
  salon_id: 1,
  revoked_at: null,
};

function job(partial: Partial<BridgeFiscalJobOwnership>): BridgeFiscalJobOwnership {
  return {
    id: 10,
    salon_id: 1,
    kind: "sale_receipt",
    status: "failed",
    locked_at: null,
    sale_id: 5,
    cash_session_id: null,
    error_message: null,
    locked_by: "roma_1",
    attempts: 1,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe("bridgeJobValidation", () => {
  it("job salon mismatch → 403", () => {
    const r = assertBridgeJobSalonOwnership(installation, job({ salon_id: 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("job_salon_mismatch");
  });

  it("reconcile_required blocca requeue", () => {
    const r = validateBridgeRequeueGate(
      job({
        error_message: "Richiede riconciliazione manuale stampante",
      }),
      { confirmZReport: false },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/riconciliazione/i);
  });

  it("processing blocca requeue", () => {
    const r = validateBridgeRequeueGate(
      job({ status: "processing", locked_at: new Date().toISOString() }),
      { confirmZReport: false },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/processing/i);
  });

  it("failed safe consente requeue", () => {
    const r = validateBridgeRequeueGate(job({ status: "failed" }), {
      confirmZReport: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.force).toBe(false);
  });
});
