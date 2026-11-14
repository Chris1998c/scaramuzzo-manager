import { describe, expect, it } from "vitest";
import {
  buildAttendanceDailySummary,
  countStaffLiveInside,
  liveStatusForRow,
  timestamptzBoundsForRomeDateRange,
  totalsByStaff,
} from "@/lib/attendance/attendanceDailySummary";
import {
  attendanceRowsToCsv,
  buildAttendanceExportCsvRows,
} from "@/lib/attendance/attendanceExportRows";
import { resolveAttendanceQuery } from "@/lib/attendance/resolveAttendanceQuery";

const names = new Map<number, string | null>([
  [73, "SARA"],
  [10, "ANNA"],
]);

describe("attendanceDailySummary", () => {
  it("Live per riga: giorno chiuso Fuori ora anche se oggi ha entrata aperta", () => {
    const rows = buildAttendanceDailySummary({
      events: [
        {
          staff_id: 73,
          salon_id: 1,
          type: "in",
          created_at: "2026-11-13T17:42:41.847647+00:00",
        },
        {
          staff_id: 73,
          salon_id: 1,
          type: "out",
          created_at: "2026-11-13T19:00:00.000Z",
        },
        {
          staff_id: 73,
          salon_id: 1,
          type: "in",
          created_at: "2026-11-14T09:32:13.000Z",
        },
      ],
      staffNameById: names,
    });

    const d13 = rows.find((r) => r.day === "2026-11-13")!;
    const d14 = rows.find((r) => r.day === "2026-11-14")!;
    expect(d13.is_incomplete).toBe(false);
    expect(liveStatusForRow(d13)).toBe("outside");
    expect(d14.has_open_shift).toBe(true);
    expect(liveStatusForRow(d14)).toBe("inside");
    expect(countStaffLiveInside(rows)).toBe(1);
  });

  it("filtra salone: Roma vs Cosenza senza mescolare sedi", () => {
    const events = [
      {
        staff_id: 73,
        salon_id: 1,
        type: "in",
        created_at: "2026-11-13T10:00:00.000Z",
      },
      {
        staff_id: 10,
        salon_id: 4,
        type: "in",
        created_at: "2026-11-13T10:05:00.000Z",
      },
      {
        staff_id: 10,
        salon_id: 4,
        type: "out",
        created_at: "2026-11-13T18:00:00.000Z",
      },
    ];
    const roma = buildAttendanceDailySummary({
      events,
      staffNameById: names,
      filters: { salonId: 1 },
    });
    const cosenza = buildAttendanceDailySummary({
      events,
      staffNameById: names,
      filters: { salonId: 4 },
    });
    expect(roma.every((r) => r.salon_id === 1)).toBe(true);
    expect(roma).toHaveLength(1);
    expect(cosenza.every((r) => r.salon_id === 4)).toBe(true);
    expect(cosenza).toHaveLength(1);
    expect(cosenza[0]!.staff_name).toBe("ANNA");
  });

  it("CET/CEST: bounds timestamptz includono mezzanotte Rome", () => {
    // CET: 13/11 23:30 Rome = 13/11 22:30Z ancora nel giorno; 14/11 00:30 Rome = 13/11 23:30Z
    const cet = timestamptzBoundsForRomeDateRange("2026-11-13", "2026-11-13");
    expect(new Date("2026-11-13T22:30:00.000Z").toISOString() >= cet.gteIso).toBe(
      true,
    );
    expect(new Date("2026-11-13T22:30:00.000Z").toISOString() < cet.ltIso).toBe(
      true,
    );
    expect(new Date("2026-11-13T23:30:00.000Z").toISOString() < cet.ltIso).toBe(
      false,
    );

    const cest = timestamptzBoundsForRomeDateRange("2026-07-13", "2026-07-13");
    expect(new Date("2026-07-13T21:30:00.000Z").toISOString() < cest.ltIso).toBe(
      true,
    );
    expect(new Date("2026-07-13T22:30:00.000Z").toISOString() < cest.ltIso).toBe(
      false,
    );
  });

  it("CSV multi-sede: colonna Salone + totali; incomplete non come chiusi", () => {
    const rows = buildAttendanceDailySummary({
      events: [
        {
          staff_id: 73,
          salon_id: 1,
          type: "in",
          created_at: "2026-11-13T10:00:00.000Z",
        },
        {
          staff_id: 73,
          salon_id: 1,
          type: "out",
          created_at: "2026-11-13T18:00:00.000Z",
        },
        {
          staff_id: 10,
          salon_id: 4,
          type: "in",
          created_at: "2026-11-13T09:00:00.000Z",
        },
      ],
      staffNameById: names,
    });
    const csvRows = buildAttendanceExportCsvRows(rows);
    expect(csvRows.some((r) => r.Salone === "Roma")).toBe(true);
    expect(csvRows.some((r) => r.Salone === "Cosenza")).toBe(true);
    const totals = totalsByStaff(rows);
    const anna = totals.find((t) => t.staff_id === 10)!;
    expect(anna.closed_days).toBe(0);
    expect(anna.incomplete_days).toBe(1);
    const csv = attendanceRowsToCsv(csvRows);
    expect(csv.startsWith("sep=;")).toBe(true);
    expect(csv).toContain("INCOMPLETA");
    expect(csv).toContain("Turni chiusi: 0; Incomplete: 1");
  });
});

describe("resolveAttendanceQuery", () => {
  const coordinatorAccess = {
    role: "coordinator",
    allowedSalonIds: [1, 2, 3, 4],
    defaultSalonId: 1,
    staffSalonId: 1,
  } as Awaited<ReturnType<typeof import("@/lib/getUserAccess").getUserAccess>>;

  it("switch Roma→Cosenza→Roma via salon_id", () => {
    const roma = resolveAttendanceQuery({
      access: coordinatorAccess,
      salonIdRaw: "1",
      todayRome: "2026-11-14",
    });
    expect(roma.salonId).toBe(1);
    expect(roma.querySalonIds).toEqual([1]);

    const cosenza = resolveAttendanceQuery({
      access: coordinatorAccess,
      salonIdRaw: "4",
      todayRome: "2026-11-14",
    });
    expect(cosenza.salonId).toBe(4);
    expect(cosenza.querySalonIds).toEqual([4]);

    const back = resolveAttendanceQuery({
      access: coordinatorAccess,
      salonIdRaw: "1",
      todayRome: "2026-11-14",
    });
    expect(back.salonId).toBe(1);
  });

  it("reception ignora salon_id richiesto e forza sede operativa", () => {
    const receptionAccess = {
      role: "reception",
      allowedSalonIds: [1],
      defaultSalonId: 1,
      staffSalonId: 1,
    } as Awaited<ReturnType<typeof import("@/lib/getUserAccess").getUserAccess>>;

    const q = resolveAttendanceQuery({
      access: receptionAccess,
      salonIdRaw: "4",
      todayRome: "2026-11-14",
    });
    expect(q.salonId).toBe(1);
    expect(q.querySalonIds).toEqual([1]);
    expect(q.canChooseSalon).toBe(false);
  });
});
