import { describe, expect, it } from "vitest";

import { computeHeaderFromLines } from "@/lib/agenda/agendaContract";
import { computeLineEndTime } from "@/lib/agenda/assertStaffSlotFree";
import {
  buildCustomerBookingLines,
  totalDurationMinutesFromLines,
} from "@/lib/customer-app/buildCustomerBookingLines";

/**
 * Contratto tempi: availability end, DTO righe e header Agenda devono coincidere
 * anche con durate non multiple di 15.
 */
describe("customer booking time consistency (non-15 multi-service)", () => {
  it("20+20: line ends, header end e slot availability usano la stessa fine 10:40", () => {
    const start = "2026-06-15T10:00:00";
    const built = buildCustomerBookingLines(start, [
      {
        service_id: 1,
        staff_id: 7,
        duration_minutes: 20,
        duration_active: 0,
        duration_processing: 0,
        need_processing: false,
        price: 10,
        vat_rate: 22,
      },
      {
        service_id: 2,
        staff_id: 7,
        duration_minutes: 20,
        duration_active: 0,
        duration_processing: 0,
        need_processing: false,
        price: 10,
        vat_rate: 22,
      },
    ]);

    const total = totalDurationMinutesFromLines(built);
    const availabilityEnd = computeLineEndTime(start, total);
    const header = computeHeaderFromLines(
      built.map((ln, i) => ({
        id: i + 1,
        start_time: ln.start_time,
        duration_minutes: ln.duration_minutes,
        staff_id: ln.staff_id,
      })),
    );

    expect(availabilityEnd).toBe("2026-06-15T10:40:00");
    expect(header.end_time).toBe("2026-06-15T10:40:00");
    expect(built[built.length - 1]!.end_time).toBe(header.end_time);
    expect(built.every((ln) => ln.end_time === computeLineEndTime(ln.start_time, ln.duration_minutes))).toBe(
      true,
    );
  });
});
