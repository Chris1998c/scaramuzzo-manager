import { describe, expect, it } from "vitest";

import {
  assertBatchInternalStaffSlotsFree,
  STAFF_SLOT_CONFLICT_MESSAGE,
} from "@/lib/agenda/assertStaffSlotFree";
import {
  assertCustomerBookingLinesInternallyFree,
  buildCustomerBookingLines,
  customerBookingLinesToBatchStaffSlots,
  totalDurationMinutesFromLines,
} from "@/lib/customer-app/buildCustomerBookingLines";

const STAFF_ID = 42;

function lineInput(
  serviceId: number,
  durationMinutes: number,
): {
  service_id: number;
  staff_id: number;
  duration_minutes: number;
  price: number;
  vat_rate: number;
} {
  return {
    service_id: serviceId,
    staff_id: STAFF_ID,
    duration_minutes: durationMinutes,
    price: 50,
    vat_rate: 22,
  };
}

describe("buildCustomerBookingLines", () => {
  it("20 + 30 min: righe contigue senza overlap interno", () => {
    const built = buildCustomerBookingLines("2026-06-15T10:00:00", [
      lineInput(1, 20),
      lineInput(2, 30),
    ]);

    expect(built).toHaveLength(2);
    expect(built[0].start_time).toBe("2026-06-15T10:00:00");
    expect(built[1].start_time).toBe("2026-06-15T10:20:00");

    expect(() => assertCustomerBookingLinesInternallyFree(built)).not.toThrow();
  });

  it("colore 60 + piega 20: seconda riga parte alla fine reale della prima", () => {
    const built = buildCustomerBookingLines("2026-06-15T10:00:00", [
      lineInput(10, 60),
      lineInput(11, 20),
    ]);

    expect(built[0].start_time).toBe("2026-06-15T10:00:00");
    expect(built[1].start_time).toBe("2026-06-15T11:00:00");
    expect(() => assertCustomerBookingLinesInternallyFree(built)).not.toThrow();
  });

  it("servizio singolo: solo prima riga snappata", () => {
    const built = buildCustomerBookingLines("2026-06-15T10:07:00", [
      lineInput(5, 30),
    ]);

    expect(built).toHaveLength(1);
    expect(built[0].start_time).toBe("2026-06-15T10:00:00");
    expect(() => assertCustomerBookingLinesInternallyFree(built)).not.toThrow();
  });

  it("vecchio snap per riga (10:20 → 10:15) genererebbe overlap interno", () => {
    const overlappingBatch = [
      { staffId: STAFF_ID, startTime: "2026-06-15T10:00:00", durationMinutes: 20 },
      { staffId: STAFF_ID, startTime: "2026-06-15T10:15:00", durationMinutes: 30 },
    ];

    expect(() => assertBatchInternalStaffSlotsFree(overlappingBatch)).toThrow(
      STAFF_SLOT_CONFLICT_MESSAGE,
    );
  });

  it("totalDurationMinutesFromLines somma le durate", () => {
    const inputs = [lineInput(1, 20), lineInput(2, 30)];
    expect(totalDurationMinutesFromLines(inputs)).toBe(50);
    expect(
      totalDurationMinutesFromLines(buildCustomerBookingLines("2026-06-15T10:00:00", inputs)),
    ).toBe(50);
  });

  it("customerBookingLinesToBatchStaffSlots mappa staff e orari", () => {
    const built = buildCustomerBookingLines("2026-06-15T10:00:00", [
      lineInput(1, 15),
      lineInput(2, 15),
    ]);
    expect(customerBookingLinesToBatchStaffSlots(built)).toEqual([
      { staffId: STAFF_ID, startTime: "2026-06-15T10:00:00", durationMinutes: 15 },
      { staffId: STAFF_ID, startTime: "2026-06-15T10:15:00", durationMinutes: 15 },
    ]);
  });
});
