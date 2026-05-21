import { describe, expect, it } from "vitest";
import {
  isSalonClosedOnDate,
  isSalonExtraOpenOnDate,
  resolveStaffAvailabilityForDate,
  type SalonOperationalDay,
  type StaffDateOverride,
} from "@/lib/salonOperationalCalendar";
import {
  checkStaffAppointmentScheduleWindow,
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

function resolve(input: {
  salonId?: number;
  staffId?: string;
  isoDate?: string;
  startTime?: string;
  durationMinutes?: number;
  salonDay?: SalonOperationalDay | null;
  staffOverride?: StaffDateOverride | null;
  scheduleMap?: StaffScheduleBySalon;
}) {
  const isoDate = input.isoDate ?? "2026-05-21";
  return resolveStaffAvailabilityForDate({
    salonId: input.salonId ?? 1,
    isoDate,
    staffId: input.staffId ?? "42",
    startTime: input.startTime ?? `${isoDate}T10:00:00`,
    durationMinutes: input.durationMinutes ?? 35,
    salonDay: input.salonDay ?? null,
    staffOverride: input.staffOverride ?? null,
    scheduleMap: input.scheduleMap ?? new Map(),
  });
}

describe("operational calendar — resolveStaffAvailabilityForDate", () => {
  it("giorno normale dentro turno = OK", () => {
    const scheduleMap = mapWithDays("42", [{ dow: 4, start: "10:00", end: "19:30" }]);
    expect(
      resolve({
        scheduleMap,
        startTime: "2026-05-21T10:00:00",
      }),
    ).toEqual({ ok: true });
    expect(
      checkStaffAppointmentScheduleWindow({
        scheduleMap,
        staffId: 42,
        salonId: 1,
        startTime: "2026-05-21T10:00:00",
        durationMinutes: 35,
      }).ok,
    ).toBe(true);
  });

  it("giorno chiuso salone = blocco", () => {
    expect(
      resolve({
        salonDay: { kind: "closed", openStartTime: null, openEndTime: null },
      }),
    ).toEqual({ ok: false, code: "salon_closed" });
    expect(isSalonClosedOnDate({ kind: "closed", openStartTime: null, openEndTime: null })).toBe(
      true,
    );
  });

  it("open_extra salone + staff override available = OK", () => {
    const scheduleMap = mapWithDays("42", [{ dow: 1 }]);
    expect(
      resolve({
        salonDay: { kind: "open_extra", openStartTime: "10:00", openEndTime: "20:00" },
        staffOverride: { kind: "available", startTime: null, endTime: null },
        scheduleMap,
        startTime: "2026-05-20T10:00:00",
        isoDate: "2026-05-20",
      }),
    ).toEqual({ ok: true });
    expect(isSalonExtraOpenOnDate({ kind: "open_extra", openStartTime: null, openEndTime: null })).toBe(
      true,
    );
  });

  it("staff unavailable = blocco", () => {
    expect(
      resolve({
        staffOverride: { kind: "unavailable", startTime: null, endTime: null },
      }),
    ).toEqual({ ok: false, code: "staff_unavailable" });
  });

  it("staff available fuori turno settimanale = OK", () => {
    const scheduleMap = mapWithDays("42", [{ dow: 1 }]);
    expect(
      resolve({
        staffOverride: { kind: "available", startTime: null, endTime: null },
        scheduleMap,
        startTime: "2026-05-21T10:00:00",
      }),
    ).toEqual({ ok: true });
  });

  it("staff available ma fuori fascia override = blocco", () => {
    expect(
      resolve({
        staffOverride: { kind: "available", startTime: "14:00", endTime: "18:00" },
        startTime: "2026-05-21T10:00:00",
      }),
    ).toEqual({ ok: false, code: "override_time" });
  });

  it("nessuna riga staff_schedule = legacy OK", () => {
    expect(
      resolve({
        scheduleMap: new Map(),
        startTime: "2026-05-21T10:00:00",
      }),
    ).toEqual({ ok: true });
  });

  it("closed salone vince su staff available", () => {
    expect(
      resolve({
        salonDay: { kind: "closed", openStartTime: null, openEndTime: null },
        staffOverride: { kind: "available", startTime: null, endTime: null },
      }),
    ).toEqual({ ok: false, code: "salon_closed" });
  });
});
