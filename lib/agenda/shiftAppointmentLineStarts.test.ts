import { describe, expect, it } from "vitest";
import {
  assertBatchInternalStaffSlotsFree,
  STAFF_SLOT_CONFLICT_MESSAGE,
} from "@/lib/agenda/assertStaffSlotFree";
import { snapToAgendaSlot, parseLocal, toNoZ } from "@/lib/agenda/agendaContract";
import {
  shiftAppointmentLineStart,
  shiftAppointmentLineTimings,
} from "@/lib/agenda/shiftAppointmentLineStarts";

/** Vecchio bug modify: snap su ogni start dopo delta. */
function legacyShiftWithPerLineSnap(startTime: string, deltaMs: number): string {
  return toNoZ(snapToAgendaSlot(new Date(parseLocal(startTime).getTime() + deltaMs)));
}

describe("shiftAppointmentLineStarts", () => {
  it("20+30: shift +60 min resta contiguo senza overlap", () => {
    const lines = [
      { id: 1, start_time: "2026-11-12T10:00:00", duration_minutes: 20, staff_id: 7 },
      { id: 2, start_time: "2026-11-12T10:20:00", duration_minutes: 30, staff_id: 7 },
    ];
    const shifted = shiftAppointmentLineTimings(lines, 60 * 60_000);
    expect(shifted.map((l) => l.start_time)).toEqual([
      "2026-11-12T11:00:00",
      "2026-11-12T11:20:00",
    ]);
    expect(() =>
      assertBatchInternalStaffSlotsFree(
        shifted.map((l) => ({
          staffId: l.staff_id ?? null,
          startTime: l.start_time,
          durationMinutes: l.duration_minutes,
        })),
      ),
    ).not.toThrow();
  });

  it("35+20: shift +15 min senza snap interno", () => {
    const shifted = shiftAppointmentLineTimings(
      [
        { id: 1, start_time: "2026-11-12T09:00:00", duration_minutes: 35, staff_id: 1 },
        { id: 2, start_time: "2026-11-12T09:35:00", duration_minutes: 20, staff_id: 1 },
      ],
      15 * 60_000,
    );
    expect(shifted.map((l) => l.start_time)).toEqual([
      "2026-11-12T09:15:00",
      "2026-11-12T09:50:00",
    ]);
    expect(() =>
      assertBatchInternalStaffSlotsFree(
        shifted.map((l) => ({
          staffId: l.staff_id ?? null,
          startTime: l.start_time,
          durationMinutes: l.duration_minutes,
        })),
      ),
    ).not.toThrow();
  });

  it("legacy snap-per-riga su 20+30 +15 inventa overlap", () => {
    const starts = [
      legacyShiftWithPerLineSnap("2026-11-12T10:00:00", 15 * 60_000),
      legacyShiftWithPerLineSnap("2026-11-12T10:20:00", 15 * 60_000),
    ];
    expect(starts).toEqual(["2026-11-12T10:15:00", "2026-11-12T10:30:00"]);
    expect(() =>
      assertBatchInternalStaffSlotsFree([
        { staffId: 1, startTime: starts[0]!, durationMinutes: 20 },
        { staffId: 1, startTime: starts[1]!, durationMinutes: 30 },
      ]),
    ).toThrow(STAFF_SLOT_CONFLICT_MESSAGE);
  });

  it("delta 0 lascia invariato", () => {
    expect(shiftAppointmentLineStart("2026-11-12T10:20:00", 0)).toBe(
      "2026-11-12T10:20:00",
    );
  });
});
