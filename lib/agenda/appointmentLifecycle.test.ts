import { describe, expect, it } from "vitest";
import {
  canModifyAppointmentAgendaLine,
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
});
