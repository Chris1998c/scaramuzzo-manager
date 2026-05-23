import { describe, expect, it } from "vitest";

import {
  BASE_COLOR_ABSENT_DAYS,
  colorAbsentThresholdDays,
  evaluateColorAbsentCustomer,
  isColorAppointmentService,
  isColorCardType,
  LIGHTENING_ABSENT_DAYS,
} from "@/lib/reports/colorAbsentSegment";

describe("colorAbsentSegment", () => {
  it("riconosce tipi scheda colore", () => {
    expect(isColorCardType("oxidation_color")).toBe(true);
    expect(isColorCardType("lightening")).toBe(true);
    expect(isColorCardType("legacy_note")).toBe(false);
  });

  it("soglia 45/70 giorni", () => {
    expect(colorAbsentThresholdDays(false)).toBe(BASE_COLOR_ABSENT_DAYS);
    expect(colorAbsentThresholdDays(true)).toBe(LIGHTENING_ABSENT_DAYS);
  });

  it("classifica appuntamento colore da nome servizio", () => {
    expect(isColorAppointmentService("Balayage naturale", null)).toBe(true);
    expect(isColorAppointmentService("Taglio uomo", null)).toBe(false);
  });

  it("segmenta cliente assente oltre soglia", () => {
    const now = new Date("2026-05-23T12:00:00").getTime();
    const row = evaluateColorAbsentCustomer({
      customerId: "c1",
      customerName: "Anna",
      phone: "3331234567",
      hasLighteningHistory: false,
      lastCardAt: "2026-03-01T10:00:00",
      lastColorAppointmentAt: "2026-03-01T10:00:00",
      nowMs: now,
    });
    expect(row).not.toBeNull();
    expect(row!.days_absent).toBeGreaterThanOrEqual(BASE_COLOR_ABSENT_DAYS);
  });

  it("esclude cliente con colore recente", () => {
    const now = new Date("2026-05-23T12:00:00").getTime();
    const row = evaluateColorAbsentCustomer({
      customerId: "c2",
      customerName: "Bob",
      phone: null,
      hasLighteningHistory: false,
      lastCardAt: "2026-05-01T10:00:00",
      lastColorAppointmentAt: "2026-05-01T10:00:00",
      nowMs: now,
    });
    expect(row).toBeNull();
  });
});
