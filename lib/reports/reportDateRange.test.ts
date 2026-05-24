import { describe, expect, it } from "vitest";

import { resolveReportDateRange } from "@/lib/reports/reportDateRange";

describe("resolveReportDateRange", () => {
  it("corregge date invertite e segnala redirect", () => {
    const r = resolveReportDateRange({
      dateFrom: "2026-05-20",
      dateTo: "2026-05-01",
      today: "2026-05-23",
    });
    expect(r.dateFrom).toBe("2026-05-01");
    expect(r.dateTo).toBe("2026-05-20");
    expect(r.wasInverted).toBe(true);
    expect(r.needsRedirect).toBe(true);
  });

  it("segna periodo oltre soglia guardrail", () => {
    const r = resolveReportDateRange({
      dateFrom: "2024-01-01",
      dateTo: "2026-05-23",
      today: "2026-05-23",
      maxDays: 366,
    });
    expect(r.exceedsMaxPeriod).toBe(true);
  });
});
