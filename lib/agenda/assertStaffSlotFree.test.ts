import { describe, expect, it } from "vitest";
import {
  computeOverlapQueryWindow,
  STAFF_SLOT_CONFLICT_MESSAGE,
  isStaffSlotConflictError,
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

describe("isStaffSlotConflictError", () => {
  it("riconosce messaggio overlap", () => {
    expect(isStaffSlotConflictError(new Error(STAFF_SLOT_CONFLICT_MESSAGE))).toBe(true);
    expect(isStaffSlotConflictError(new Error("altro"))).toBe(false);
  });
});
