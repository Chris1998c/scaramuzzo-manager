import { describe, expect, it } from "vitest";
import {
  isUncertainFiscalVoid,
  uncertainFiscalVoidBannerCopy,
  uncertainFiscalVoidModalCopy,
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
  it("requires Epson registration check, not paper-only, and blocks if uncertain", () => {
    const c = uncertainFiscalVoidBannerCopy();
    expect(c.title).toMatch(/Esito fiscale da verificare/i);
    expect(c.detail).toMatch(/registrazioni|memoria fiscale/i);
    expect(c.detail).toMatch(/non solo/i);
    expect(c.detail).toMatch(/tecnico della cassa/i);
    expect(c.detail).toMatch(/Non viene reinviato/i);
  });
});

describe("uncertainFiscalVoidModalCopy", () => {
  it("labels not-printed as registration absence and keeps uncertain blocked", () => {
    const m = uncertainFiscalVoidModalCopy();
    expect(m.notPrintedLabel).toMatch(/registrazioni Epson/i);
    expect(m.notPrintedLabel).not.toMatch(/carta/i);
    expect(m.uncertainHint).toMatch(/tecnico della cassa/i);
    expect(m.uncertainHint).toMatch(/Non confermare/i);
  });
});
