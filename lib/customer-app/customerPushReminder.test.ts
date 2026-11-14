import { describe, expect, it } from "vitest";
import { buildCustomerPushPayload } from "./customerPushReminder";

describe("push reminder", () => {
  it("uses Rome time in winter and a fixed same-origin destination", () => {
    const row = { appointment_id: 42, subscription_id: "id", salon_name: "Roma",
      endpoint: "https://web.push.apple.com/x", p256dh: "", auth: "",
      scheduled_for: "2026-11-15T12:30:00+00:00" };
    expect(buildCustomerPushPayload(row)).toMatchObject({
      body: expect.stringContaining("13:30"), url: "/app-clienti/bookings",
    });
  });
});
