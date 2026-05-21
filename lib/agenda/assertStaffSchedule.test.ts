import { describe, expect, it } from "vitest";
import {
  checkStaffAppointmentScheduleWindow,
  filterStaffForAgendaDay,
  isoDayOfWeekFromISODateLocal,
  isStaffOffScheduleForAgendaDay,
  isStaffVisibleOnAgendaDayForSalon,
  type StaffScheduleBySalon,
} from "@/lib/staffSchedule";

function mapWithDays(
  staffId: string,
  days: Array<{ dow: number; start?: string | null; end?: string | null }>,
): StaffScheduleBySalon {
  const inner = new Map<number, { startTime: string | null; endTime: string | null }>();
  for (const d of days) {
    inner.set(d.dow, { startTime: d.start ?? null, endTime: d.end ?? null });
  }
  return new Map([[staffId, inner]]);
}

describe("staff schedule enforcement rules", () => {
  it("isoDayOfWeekFromISODateLocal: giovedì 2026-05-21", () => {
    expect(isoDayOfWeekFromISODateLocal("2026-05-21")).toBe(4);
  });

  it("legacy: staff senza righe schedule → tutti i giorni", () => {
    const map: StaffScheduleBySalon = new Map();
    expect(isStaffVisibleOnAgendaDayForSalon(map, "42", 3)).toBe(true);
    expect(
      checkStaffAppointmentScheduleWindow({
        scheduleMap: map,
        staffId: 42,
        salonId: 1,
        startTime: "2026-05-21T10:00:00",
        durationMinutes: 35,
      }).ok,
    ).toBe(true);
  });

  it("con turni: solo giorni nel set", () => {
    const map = mapWithDays("42", [{ dow: 1 }, { dow: 2 }]);
    expect(isStaffVisibleOnAgendaDayForSalon(map, "42", 1)).toBe(true);
    expect(isStaffVisibleOnAgendaDayForSalon(map, "42", 5)).toBe(false);
  });

  it("giorno attivo senza orari: default salone Roma", () => {
    const map = mapWithDays("42", [{ dow: 4, start: null, end: null }]);
    expect(
      checkStaffAppointmentScheduleWindow({
        scheduleMap: map,
        staffId: 42,
        salonId: 1,
        startTime: "2026-05-21T10:00:00",
        durationMinutes: 35,
      }),
    ).toEqual({ ok: true });
  });

  it("fuori giorno → kind day", () => {
    const map = mapWithDays("42", [{ dow: 1 }]);
    expect(
      checkStaffAppointmentScheduleWindow({
        scheduleMap: map,
        staffId: 42,
        salonId: 1,
        startTime: "2026-05-21T10:00:00",
        durationMinutes: 35,
      }),
    ).toEqual({ ok: false, kind: "day" });
  });

  it("fuori fascia oraria → kind time", () => {
    const map = mapWithDays("42", [{ dow: 4, start: "10:00", end: "19:30" }]);
    expect(
      checkStaffAppointmentScheduleWindow({
        scheduleMap: map,
        staffId: 42,
        salonId: 1,
        startTime: "2026-05-21T09:00:00",
        durationMinutes: 35,
      }),
    ).toEqual({ ok: false, kind: "time" });
  });

  it("dentro fascia → ok", () => {
    const map = mapWithDays("42", [{ dow: 4, start: "10:00", end: "19:30" }]);
    expect(
      checkStaffAppointmentScheduleWindow({
        scheduleMap: map,
        staffId: 42,
        salonId: 1,
        startTime: "2026-05-21T10:00:00",
        durationMinutes: 35,
      }),
    ).toEqual({ ok: true });
  });

  it("servizio che supera end_time → time", () => {
    const map = mapWithDays("42", [{ dow: 4, start: "10:00", end: "19:30" }]);
    expect(
      checkStaffAppointmentScheduleWindow({
        scheduleMap: map,
        staffId: 42,
        salonId: 1,
        startTime: "2026-05-21T19:00:00",
        durationMinutes: 45,
      }),
    ).toEqual({ ok: false, kind: "time" });
  });

  it("filterStaffForAgendaDay include valore assegnato fuori turno", () => {
    const map = mapWithDays("42", [{ dow: 1 }]);
    const rows = [
      { id: 42, name: "A" },
      { id: 99, name: "B" },
    ];
    const map99 = mapWithDays("99", [{ dow: 1 }, { dow: 2 }, { dow: 3 }]);
    const combined: StaffScheduleBySalon = new Map([...map, ...map99]);
    const filtered = filterStaffForAgendaDay(rows, combined, "2026-05-21", [42]);
    expect(filtered.map((r) => r.id)).toEqual([42]);
  });

  it("isStaffOffScheduleForAgendaDay", () => {
    const map = mapWithDays("42", [{ dow: 1 }]);
    expect(isStaffOffScheduleForAgendaDay(map, 42, "2026-05-21")).toBe(true);
    expect(isStaffOffScheduleForAgendaDay(map, 99, "2026-05-21")).toBe(false);
  });
});
