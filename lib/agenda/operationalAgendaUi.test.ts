import { describe, expect, it } from "vitest";
import {
  canSubmitNewBookingOnOperationalDay,
  filterStaffForOperationalAgendaModal,
  hasAssignedStaffUnavailableWarning,
  isStaffExtraOnOperationalDate,
  isStaffUnavailableOnOperationalDate,
  emptyOperationalSnapshot,
} from "@/lib/agenda/operationalAgendaUi";
import type { StaffScheduleBySalon } from "@/lib/staffSchedule";

function scheduleOnlyMonday(staffId: string): StaffScheduleBySalon {
  return new Map([
    [
      staffId,
      new Map([[1, { startTime: "10:00", endTime: "19:00" }]]),
    ],
  ]);
}

describe("operationalAgendaUi", () => {
  it("giorno chiuso blocca submit logic", () => {
    expect(
      canSubmitNewBookingOnOperationalDay({
        kind: "closed",
        openStartTime: null,
        openEndTime: null,
      }),
    ).toBe(false);
    expect(canSubmitNewBookingOnOperationalDay(null)).toBe(true);
  });

  it("staff available extra incluso fuori turno", () => {
    const map = scheduleOnlyMonday("42");
    const op = {
      salonDay: null,
      staffOverrides: new Map([
        ["42", { kind: "available" as const, startTime: null, endTime: null }],
      ]),
    };
    const rows = [{ id: 42, name: "Scaramuzzo" }];
    const filtered = filterStaffForOperationalAgendaModal(
      rows,
      map,
      "2026-05-23",
      op,
    );
    expect(filtered).toHaveLength(1);
    expect(isStaffExtraOnOperationalDate(42, map, "2026-05-23", op)).toBe(true);
  });

  it("staff unavailable escluso salvo include", () => {
    const map = scheduleOnlyMonday("42");
    const op = {
      salonDay: null,
      staffOverrides: new Map([
        ["42", { kind: "unavailable" as const, startTime: null, endTime: null }],
      ]),
    };
    const rows = [{ id: 42, name: "Nelly" }];
    expect(
      filterStaffForOperationalAgendaModal(rows, map, "2026-05-19", op),
    ).toHaveLength(0);
    expect(
      filterStaffForOperationalAgendaModal(rows, map, "2026-05-19", op, ["42"]),
    ).toHaveLength(1);
    expect(isStaffUnavailableOnOperationalDate(42, op)).toBe(true);
    expect(hasAssignedStaffUnavailableWarning(["42"], op)).toBe(true);
  });

  it("legacy senza schedule = staff visibile", () => {
    const filtered = filterStaffForOperationalAgendaModal(
      [{ id: 99, name: "X" }],
      new Map(),
      "2026-05-21",
      emptyOperationalSnapshot(),
    );
    expect(filtered).toHaveLength(1);
  });
});
