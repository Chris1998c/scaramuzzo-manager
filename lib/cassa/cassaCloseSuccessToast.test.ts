import { describe, expect, it } from "vitest";
import { cassaCloseSuccessToast } from "@/lib/cassa/cassaCloseSuccessToast";

describe("cassaCloseSuccessToast", () => {
  it("prefers warning", () => {
    const t = cassaCloseSuccessToast({
      warning: "Bridge non raggiungibile",
      fiscalPrintJobId: 9,
      printerEnabled: true,
    });
    expect(t.tone).toBe("warning");
    expect(t.description).toContain("Bridge");
  });

  it("announces fiscal job when present", () => {
    const t = cassaCloseSuccessToast({
      fiscalPrintJobId: 12,
      printerEnabled: true,
    });
    expect(t.description).toMatch(/job n\. 12/);
    expect(t.description).toMatch(/Print Bridge/);
  });

  it("says session printer off without 'nel sistema'", () => {
    const t = cassaCloseSuccessToast({
      fiscalPrintJobId: null,
      printerEnabled: false,
    });
    expect(t.description).toMatch(/senza stampa fiscale/i);
    expect(t.description).toMatch(/sessione di cassa/i);
    expect(t.description).not.toMatch(/nel sistema/i);
  });

  it("generic fallback when printer state unknown and no job", () => {
    const t = cassaCloseSuccessToast({});
    expect(t.description).toMatch(/Nessuna stampa fiscale accodata/);
  });
});
