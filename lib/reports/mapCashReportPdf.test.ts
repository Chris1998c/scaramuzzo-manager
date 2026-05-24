import { describe, expect, it } from "vitest";

import {
  buildCashReportAnomalies,
  mapCashReportToPdfPayload,
} from "@/lib/reports/mapCashReportPdf";

describe("mapCashReportPdf", () => {
  it("mappa totali e sessioni per PDF cassa", () => {
    const payload = mapCashReportToPdfPayload({
      salonName: "Roma",
      salonId: 1,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-23",
      totals: { sessions: 1, gross_total: 100, gross_cash: 60, gross_card: 40 },
      sessions: [
        {
          id: 9,
          session_date: "2026-05-20",
          opened_at: "2026-05-20T09:00:00",
          closed_at: "2026-05-20T20:00:00",
          status: "closed",
          gross_total: 100,
          gross_cash: 60,
          gross_card: 40,
          declared_cash: 58,
          cash_difference: -2,
        },
      ],
    });

    expect(payload.salonName).toBe("Roma");
    expect(payload.totals.gross_total).toBe(100);
    expect(payload.sessions[0]?.gross_cash).toBe(60);
    expect(payload.sessions[0]?.cash_difference).toBe(-2);
  });

  it("rileva anomalie sessioni aperte e differenze contanti", () => {
    const anomalies = buildCashReportAnomalies([
      { id: 1, status: "open", declared_cash: 0, cash_difference: 0 },
      { id: 2, status: "closed", declared_cash: 100, cash_difference: 5 },
    ]);
    expect(anomalies.some((a) => a.title.includes("aperte"))).toBe(true);
    expect(anomalies.some((a) => a.title.includes("Differenza"))).toBe(true);
  });
});
