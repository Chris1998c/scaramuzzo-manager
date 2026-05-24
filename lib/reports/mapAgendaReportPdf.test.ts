import { describe, expect, it } from "vitest";

import { mapAgendaReportToPdfPayload } from "@/lib/reports/mapAgendaReportPdf";

describe("mapAgendaReportPdf", () => {
  it("mappa KPI agenda e giorni no-show", () => {
    const payload = mapAgendaReportToPdfPayload({
      salonName: "Roma",
      salonId: 1,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-23",
      totals: {
        appointments: 10,
        done: 7,
        no_show: 2,
        cancelled: 1,
        completion_rate: 70,
      },
      daily: [
        { day: "2026-05-10", appointments: 3, done: 2, no_show: 1, cancelled: 0 },
        { day: "2026-05-11", appointments: 2, done: 2, no_show: 0, cancelled: 0 },
      ],
      staffUtilization: [],
    });

    expect(payload.totals.missed).toBe(2);
    expect(payload.noShowDays).toHaveLength(1);
    expect(payload.showStaffSection).toBe(false);
  });

  it("mostra staff solo con ore e giorni affidabili (no utilization %)", () => {
    const payload = mapAgendaReportToPdfPayload({
      salonName: "Roma",
      salonId: 1,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-23",
      totals: { appointments: 5, done: 5, no_show: 0, cancelled: 0, completion_rate: 100 },
      daily: [],
      staffUtilization: [
        {
          staff_id: "1",
          staff_name: "Giulia",
          booked_hours: 6.5,
          working_days: 2,
          utilization_pct: 40,
        },
        { staff_id: "2", staff_name: "Vuoto", booked_hours: 0, working_days: 0, utilization_pct: 0 },
      ],
    });

    expect(payload.showStaffSection).toBe(true);
    expect(payload.staffRows).toHaveLength(1);
    expect(payload.staffRows[0]?.staff_name).toBe("Giulia");
    expect(payload.staffRows[0]).not.toHaveProperty("utilization_pct");
  });
});
