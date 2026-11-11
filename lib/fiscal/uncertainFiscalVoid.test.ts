import { describe, expect, it } from "vitest";
import {
  isUncertainFiscalVoid,
  uncertainFiscalVoidBannerCopy,
} from "@/lib/fiscal/uncertainFiscalVoid";

describe("isUncertainFiscalVoid", () => {
  it("true only for fiscal_void_pending with cancelled void and no active job", () => {
    expect(
      isUncertainFiscalVoid({
        saleStatus: "fiscal_void_pending",
        voidVoidJob: null,
        latestCancelledVoidJobId: 9,
      }),
    ).toBe(true);

    expect(
      isUncertainFiscalVoid({
        saleStatus: "fiscal_void_pending",
        voidVoidJob: { job_id: 1, status: "processing" },
        latestCancelledVoidJobId: 9,
      }),
    ).toBe(false);

    expect(
      isUncertainFiscalVoid({
        saleStatus: "posted",
        voidVoidJob: null,
        latestCancelledVoidJobId: 9,
      }),
    ).toBe(false);

    expect(
      isUncertainFiscalVoid({
        saleStatus: "fiscal_void_pending",
        voidVoidJob: null,
        latestCancelledVoidJobId: null,
      }),
    ).toBe(false);
  });
});

describe("uncertainFiscalVoidBannerCopy", () => {
  it("asks to verify Epson without auto-resend", () => {
    const c = uncertainFiscalVoidBannerCopy();
    expect(c.title).toMatch(/Esito fiscale da verificare/i);
    expect(c.detail).toMatch(/Epson/i);
    expect(c.detail).toMatch(/Non viene reinviato/i);
  });
});
