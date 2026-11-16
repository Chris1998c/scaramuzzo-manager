import { describe, expect, it } from "vitest";

import {
  CUSTOMER_APP_NO_HARD_DELETE_MESSAGE,
  CUSTOMER_APP_SOURCE,
  isCustomerAppAppointmentSource,
  shouldHardDeleteAppointment,
} from "./appointmentDeletePolicy";

describe("appointmentDeletePolicy", () => {
  it("riconosce solo source customer_app", () => {
    expect(isCustomerAppAppointmentSource("customer_app")).toBe(true);
    expect(isCustomerAppAppointmentSource("CUSTOMER_APP")).toBe(true);
    expect(isCustomerAppAppointmentSource("  customer_app  ")).toBe(true);
    expect(isCustomerAppAppointmentSource("agenda")).toBe(false);
    expect(isCustomerAppAppointmentSource("walk_in")).toBe(false);
    expect(isCustomerAppAppointmentSource(null)).toBe(false);
    expect(isCustomerAppAppointmentSource(undefined)).toBe(false);
  });

  it("hard-delete solo se non customer_app", () => {
    expect(shouldHardDeleteAppointment(CUSTOMER_APP_SOURCE)).toBe(false);
    expect(shouldHardDeleteAppointment("agenda")).toBe(true);
    expect(shouldHardDeleteAppointment(null)).toBe(true);
  });

  it("messaggio hard-delete bloccato è esplicito", () => {
    expect(CUSTOMER_APP_NO_HARD_DELETE_MESSAGE.toLowerCase()).toContain("annulla");
    expect(CUSTOMER_APP_NO_HARD_DELETE_MESSAGE.toLowerCase()).toContain("storico");
  });
});
