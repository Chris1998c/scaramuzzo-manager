import { describe, expect, it } from "vitest";
import {
  canModifyAppointmentAgendaLine,
  canModifyAppointmentHeader,
  canSetAppointmentLifecycleStatus,
} from "@/lib/agenda/appointmentLifecycle";
import {
  assertBatchInternalStaffSlotsFree,
  STAFF_SLOT_CONFLICT_MESSAGE,
} from "@/lib/agenda/assertStaffSlotFree";
import { buildContiguousAgendaLines } from "@/lib/agenda/buildContiguousAgendaLines";
import { appointmentCheckoutIdempotencyKey } from "@/lib/cassa/appointmentCheckoutIdempotency";

/**
 * Collaudo puro del ciclo appuntamento (senza DB production).
 * Coerenza status ↔ vendita ↔ modificabilità ↔ orari multi-servizio non-15.
 */
describe("appointment cycle consistency (pure)", () => {
  it("create multi-servizio 20+45: orari contigue e batch libero", () => {
    const timed = buildContiguousAgendaLines("2026-11-12T09:00:00", [
      { duration_minutes: 20, staffId: 11 },
      { duration_minutes: 45, staffId: 11 },
    ]);
    expect(timed.map((l) => l.start_time)).toEqual([
      "2026-11-12T09:00:00",
      "2026-11-12T09:20:00",
    ]);
    expect(() =>
      assertBatchInternalStaffSlotsFree(
        timed.map((l) => ({
          staffId: l.staffId,
          startTime: l.start_time,
          durationMinutes: l.duration_minutes,
        })),
      ),
    ).not.toThrow();
  });

  it("cambio collaboratore stesso orario: staff diversi non confliggono nel batch", () => {
    const timed = buildContiguousAgendaLines("2026-11-12T11:00:00", [
      { duration_minutes: 35, staffId: 1 },
      { duration_minutes: 20, staffId: 2 },
    ]);
    expect(() =>
      assertBatchInternalStaffSlotsFree(
        timed.map((l) => ({
          staffId: l.staffId,
          startTime: l.start_time,
          durationMinutes: l.duration_minutes,
        })),
      ),
    ).not.toThrow();
  });

  it("sovrapposizione stesso staff: rifiutata", () => {
    expect(() =>
      assertBatchInternalStaffSlotsFree([
        { staffId: 3, startTime: "2026-11-12T14:00:00", durationMinutes: 60 },
        { staffId: 3, startTime: "2026-11-12T14:30:00", durationMinutes: 30 },
      ]),
    ).toThrow(STAFF_SLOT_CONFLICT_MESSAGE);
  });

  it("annullamento prima della vendita: scheduled e in_sala consentiti", () => {
    expect(
      canSetAppointmentLifecycleStatus({ status: "scheduled", target: "cancelled" }).allowed,
    ).toBe(true);
    expect(
      canSetAppointmentLifecycleStatus({ status: "in_sala", target: "cancelled" }).allowed,
    ).toBe(true);
    expect(canModifyAppointmentHeader({ status: "scheduled" }).allowed).toBe(true);
    expect(canModifyAppointmentAgendaLine({ status: "in_sala" }).allowed).toBe(true);
  });

  it("annullamento dopo vendita: bloccato; header/line non modificabili", () => {
    expect(
      canSetAppointmentLifecycleStatus({
        status: "scheduled",
        sale_id: 501,
        target: "cancelled",
      }).allowed,
    ).toBe(false);
    expect(canModifyAppointmentHeader({ status: "done", sale_id: 501 }).allowed).toBe(false);
    expect(canModifyAppointmentAgendaLine({ status: "done", sale_id: 501 }).allowed).toBe(false);
    expect(canModifyAppointmentHeader({ status: "scheduled", sale_id: 501 }).allowed).toBe(false);
  });

  it("doppia conferma checkout: stessa idempotency key per appointment", () => {
    expect(appointmentCheckoutIdempotencyKey(141)).toBe("appointment:141");
    expect(appointmentCheckoutIdempotencyKey(141)).toBe(appointmentCheckoutIdempotencyKey(141));
  });
});
