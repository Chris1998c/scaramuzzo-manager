import { describe, expect, it } from "vitest";
import {
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
});
