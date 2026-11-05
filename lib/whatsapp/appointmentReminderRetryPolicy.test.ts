import { describe, expect, it } from "vitest";

import {
  classifyWhatsAppGraphFailure,
  computeNextRetryAt,
  evaluateReminderRetryPreconditions,
} from "@/lib/whatsapp/appointmentReminderRetryPolicy";

describe("classifyWhatsAppGraphFailure", () => {
  it("segna recuperabili solo risposte HTTP/Meta esplicite", () => {
    expect(classifyWhatsAppGraphFailure({ httpStatus: 429 }).retryable).toBe(true);
    expect(classifyWhatsAppGraphFailure({ httpStatus: 503 }).retryable).toBe(true);
    expect(classifyWhatsAppGraphFailure({ code: 130429 }).retryable).toBe(true);
  });

  it("non ritenta timeout o rete ambigua", () => {
    expect(classifyWhatsAppGraphFailure({ aborted: true }).retryable).toBe(false);
    expect(
      classifyWhatsAppGraphFailure({ networkWithoutResponse: true }).retryable,
    ).toBe(false);
    expect(classifyWhatsAppGraphFailure({ httpStatus: 400, code: 100 }).retryable).toBe(
      false,
    );
  });
});

describe("computeNextRetryAt", () => {
  it("backoff e stop a max retries", () => {
    const now = new Date("2026-11-05T12:00:00.000Z");
    expect(computeNextRetryAt(0, now)?.getTime()).toBe(now.getTime() + 15 * 60 * 1000);
    expect(computeNextRetryAt(3, now)).toBeNull();
  });
});

describe("evaluateReminderRetryPreconditions", () => {
  const base = {
    reminderScheduledForIso: "2026-11-06T10:00:00.000Z",
    appointment: {
      status: "scheduled",
      startTimeIso: "2026-11-06T10:00:00.000Z",
    },
    salon: {
      isEnabled: true,
      reminderEnabled: true,
      phoneNumberId: "1413913078469164",
    },
    now: new Date("2026-11-05T12:00:00.000Z"),
  };

  it("ok quando appuntamento e config validi", () => {
    expect(evaluateReminderRetryPreconditions(base)).toEqual({ ok: true });
  });

  it("blocca annullati, modificati, trascorsi e flag spenti", () => {
    expect(
      evaluateReminderRetryPreconditions({
        ...base,
        appointment: { ...base.appointment, status: "cancelled" },
      }).ok,
    ).toBe(false);

    expect(
      evaluateReminderRetryPreconditions({
        ...base,
        appointment: {
          ...base.appointment,
          startTimeIso: "2026-11-06T12:00:00.000Z",
        },
      }).ok,
    ).toBe(false);

    expect(
      evaluateReminderRetryPreconditions({
        ...base,
        now: new Date("2026-11-07T12:00:00.000Z"),
      }).ok,
    ).toBe(false);

    expect(
      evaluateReminderRetryPreconditions({
        ...base,
        salon: { ...base.salon, reminderEnabled: false },
      }).ok,
    ).toBe(false);
  });
});
