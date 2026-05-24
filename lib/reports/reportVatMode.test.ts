import { describe, expect, it } from "vitest";

import { parseReportVatMode, reportVatModeLabel } from "@/lib/reports/reportVatMode";

describe("reportVatMode", () => {
  it("parse vat_mode e alias iva", () => {
    expect(parseReportVatMode("gross")).toBe("gross");
    expect(parseReportVatMode("net")).toBe("net");
    expect(parseReportVatMode("imponibile")).toBe("net");
    expect(parseReportVatMode(null)).toBe("gross");
  });

  it("etichette export", () => {
    expect(reportVatModeLabel("gross")).toBe("Valori con IVA");
    expect(reportVatModeLabel("net")).toBe("Valori imponibili");
  });
});
