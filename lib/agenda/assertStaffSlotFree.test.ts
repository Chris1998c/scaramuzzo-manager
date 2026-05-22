import { describe, expect, it } from "vitest";
import {
  assertBatchInternalStaffSlotsFree,
  computeOverlapQueryWindow,
  isStaffSlotConflictError,
  isStaffSlotConflictFromDbError,
  isStaffSlotConflictOrDbError,
  isTerminalAppointmentStatus,
  STAFF_SLOT_CONFLICT_MESSAGE,
  staffSlotIntervalsOverlap,
} from "./assertStaffSlotFree";

describe("computeOverlapQueryWindow", () => {
  it("include giorno slot e giorno precedente", () => {
    const { windowStart, windowEnd } = computeOverlapQueryWindow(
      "2026-05-22T11:00:00",
      "2026-05-22T12:00:00",
    );
    expect(windowStart).toMatch(/^2026-05-21T00:00:00/);
    expect(windowEnd).toMatch(/^2026-05-22T23:59:59/);
  });

  it("copre due giorni calendario se end è giorno dopo", () => {
    const { windowStart, windowEnd } = computeOverlapQueryWindow(
      "2026-05-22T23:00:00",
      "2026-05-23T01:00:00",
    );
    expect(windowStart).toMatch(/^2026-05-21T00:00:00/);
    expect(windowEnd).toMatch(/^2026-05-23T23:59:59/);
  });
});

describe("staffSlotIntervalsOverlap", () => {
  it("rileva overlap semi-aperto", () => {
    const t0 = Date.parse("2026-05-22T10:00:00");
    const t1 = Date.parse("2026-05-22T11:00:00");
    const tHalf = Date.parse("2026-05-22T10:30:00");
    expect(staffSlotIntervalsOverlap(t0, t1, tHalf, t1)).toBe(true);
    expect(staffSlotIntervalsOverlap(t0, t1, t1, t1 + 3_600_000)).toBe(false);
  });
});

describe("isStaffSlotConflictError", () => {
  it("riconosce messaggio overlap", () => {
    expect(isStaffSlotConflictError(new Error(STAFF_SLOT_CONFLICT_MESSAGE))).toBe(true);
    expect(isStaffSlotConflictError(new Error("altro"))).toBe(false);
  });
});

describe("isStaffSlotConflictFromDbError", () => {
  it("riconosce messaggio in PostgREST-like error", () => {
    expect(
      isStaffSlotConflictFromDbError({
        message: `trigger: ${STAFF_SLOT_CONFLICT_MESSAGE}`,
        code: "P0001",
      }),
    ).toBe(true);
    expect(isStaffSlotConflictFromDbError({ message: "altro", code: "23505" })).toBe(false);
  });

  it("isStaffSlotConflictOrDbError unifica JS e DB", () => {
    expect(isStaffSlotConflictOrDbError(new Error(STAFF_SLOT_CONFLICT_MESSAGE))).toBe(true);
    expect(
      isStaffSlotConflictOrDbError({ message: STAFF_SLOT_CONFLICT_MESSAGE, details: null }),
    ).toBe(true);
  });
});

describe("isTerminalAppointmentStatus", () => {
  it("ignora status terminali (allineato trigger DB)", () => {
    expect(isTerminalAppointmentStatus("cancelled")).toBe(true);
    expect(isTerminalAppointmentStatus("NO_SHOW")).toBe(true);
    expect(isTerminalAppointmentStatus("noshow")).toBe(true);
    expect(isTerminalAppointmentStatus("done")).toBe(true);
    expect(isTerminalAppointmentStatus("scheduled")).toBe(false);
    expect(isTerminalAppointmentStatus("in_sala")).toBe(false);
  });
});

describe("assertBatchInternalStaffSlotsFree", () => {
  it("passa con stesso staff e fasce consecutive", () => {
    expect(() =>
      assertBatchInternalStaffSlotsFree([
        { staffId: 1, startTime: "2026-05-22T10:00:00", durationMinutes: 30 },
        { staffId: 1, startTime: "2026-05-22T10:30:00", durationMinutes: 30 },
      ]),
    ).not.toThrow();
  });

  it("fallisce con overlap nello stesso payload", () => {
    expect(() =>
      assertBatchInternalStaffSlotsFree([
        { staffId: 1, startTime: "2026-05-22T10:00:00", durationMinutes: 60 },
        { staffId: 1, startTime: "2026-05-22T10:30:00", durationMinutes: 30 },
      ]),
    ).toThrow(STAFF_SLOT_CONFLICT_MESSAGE);
  });

  it("staff diversi non confliggono nel batch", () => {
    expect(() =>
      assertBatchInternalStaffSlotsFree([
        { staffId: 1, startTime: "2026-05-22T10:00:00", durationMinutes: 60 },
        { staffId: 2, startTime: "2026-05-22T10:00:00", durationMinutes: 60 },
      ]),
    ).not.toThrow();
  });
});
