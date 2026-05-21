import { describe, expect, it } from "vitest";
import {
  canModifyAppointmentAgendaLine,
  canModifyAppointmentHeader,
  canSetAppointmentLifecycleStatus,
  canShowLifecycleActions,
} from "./appointmentLifecycle";

describe("appointmentLifecycle", () => {
  it("blocca con vendita", () => {
    const r = canSetAppointmentLifecycleStatus({
      status: "scheduled",
      sale_id: 99,
      target: "cancelled",
    });
    expect(r.allowed).toBe(false);
  });

  it("blocca done", () => {
    expect(
      canSetAppointmentLifecycleStatus({ status: "done", target: "cancelled" }).allowed,
    ).toBe(false);
  });

  it("no-show non su in_sala", () => {
    expect(
      canSetAppointmentLifecycleStatus({ status: "in_sala", target: "no_show" }).allowed,
    ).toBe(false);
  });

  it("annulla da scheduled ok", () => {
    expect(
      canSetAppointmentLifecycleStatus({ status: "scheduled", target: "cancelled" }).allowed,
    ).toBe(true);
  });

  it("canShowLifecycleActions nasconde terminali", () => {
    expect(canShowLifecycleActions({ status: "cancelled" })).toBe(false);
    expect(canShowLifecycleActions({ status: "scheduled" })).toBe(true);
  });

  it("canModifyAppointmentAgendaLine blocca terminali", () => {
    for (const status of ["done", "cancelled", "no_show", "noshow"] as const) {
      const r = canModifyAppointmentAgendaLine({ status });
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.error).toContain("chiuso");
    }
  });

  it("canModifyAppointmentAgendaLine blocca sale_id", () => {
    const r = canModifyAppointmentAgendaLine({ status: "scheduled", sale_id: 70 });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.error).toContain("vendita");
  });

  it("canModifyAppointmentAgendaLine consente scheduled senza vendita", () => {
    expect(canModifyAppointmentAgendaLine({ status: "scheduled" }).allowed).toBe(true);
    expect(canModifyAppointmentAgendaLine({ status: "in_sala" }).allowed).toBe(true);
  });

  describe("canModifyAppointmentHeader (PATCH appointments/[id])", () => {
    it("done bloccato", () => {
      const r = canModifyAppointmentHeader({ status: "done" });
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.error).toBe("Appuntamento chiuso: modifica non consentita");
    });

    it("cancelled bloccato", () => {
      expect(canModifyAppointmentHeader({ status: "cancelled" }).allowed).toBe(false);
    });

    it("no_show bloccato", () => {
      expect(canModifyAppointmentHeader({ status: "no_show" }).allowed).toBe(false);
      expect(canModifyAppointmentHeader({ status: "noshow" }).allowed).toBe(false);
    });

    it("sale_id bloccato", () => {
      const r = canModifyAppointmentHeader({ status: "scheduled", sale_id: 70 });
      expect(r.allowed).toBe(false);
      if (!r.allowed) {
        expect(r.error).toBe("Appuntamento collegato a una vendita: modifica non consentita");
      }
    });

    it("scheduled senza sale_id modificabile", () => {
      expect(canModifyAppointmentHeader({ status: "scheduled" }).allowed).toBe(true);
      expect(canModifyAppointmentHeader({ status: "in_sala" }).allowed).toBe(true);
    });
  });
});
