import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from, logBridgeJobEventMock } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  logBridgeJobEventMock: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc,
    from,
  },
}));

vi.mock("@/lib/bridge/bridgeJobAudit", () => ({
  logBridgeJobEvent: logBridgeJobEventMock,
}));

import {
  claimBridgeFiscalJob,
  finalizeBridgeFiscalJob,
} from "@/lib/bridge/bridgeFiscalJobs";
const auth = {
  token_id: "tok",
  installation: {
    id: "inst",
    bridge_id: "roma_1",
    salon_id: 1,
    revoked_at: null,
  },
};

describe("bridgeFiscalJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claim returns single serialized job", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 42,
          kind: "sale_receipt",
          payload: { x: 1 },
          attempts: 1,
          created_at: "2026-01-01T00:00:00Z",
          sale_id: 9,
          salon_id: 1,
        },
      ],
      error: null,
    });

    const result = await claimBridgeFiscalJob(auth, {
      bridge_id: "roma_1",
      salon_id: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job?.id).toBe(42);
      expect(result.job?.salon_id).toBe(1);
      expect(Object.keys(result.job ?? {})).toEqual([
        "id",
        "kind",
        "payload",
        "attempts",
        "created_at",
        "sale_id",
        "salon_id",
      ]);
    }
    expect(rpc).toHaveBeenCalledWith("claim_fiscal_print_jobs", {
      p_bridge_id: "roma_1",
      p_limit: 1,
      p_salon_id: 1,
    });
    expect(logBridgeJobEventMock).toHaveBeenCalled();
  });

  it("salon mismatch on claim context → 403", async () => {
    const result = await claimBridgeFiscalJob(auth, { salon_id: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("salon_id_mismatch");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("finalize idempotent logs audit", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 42,
        salon_id: 1,
        kind: "sale_receipt",
        status: "processing",
        locked_by: "roma_1",
        payload: {},
        sale_id: 1,
        cash_session_id: null,
        locked_at: new Date().toISOString(),
        attempts: 1,
        created_at: new Date().toISOString(),
        error_message: null,
      },
      error: null,
    });
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });

    rpc.mockResolvedValue({
      data: [
        {
          ok: true,
          already_finalized: true,
          sale_updated: false,
          new_job_status: "completed",
          new_sale_status: null,
          skipped_reason: null,
        },
      ],
      error: null,
    });

    const result = await finalizeBridgeFiscalJob(auth, {
      job_id: 42,
      success: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.already_finalized).toBe(true);
    expect(logBridgeJobEventMock).toHaveBeenCalledWith(
      auth.installation,
      "finalize_success",
      expect.objectContaining({ job_id: 42 }),
    );
  });
});
