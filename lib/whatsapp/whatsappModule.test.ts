import { describe, expect, it } from "vitest";

import {
  isAppointmentReminderStatus,
  normalizeReminderStatusForDisplay,
} from "@/lib/whatsapp/appointmentReminderStatuses";
import { evaluateSalonWhatsAppConfig } from "@/lib/whatsapp/salonWhatsAppConfig";

describe("salonWhatsAppConfig", () => {
  it("ready quando canale attivo con phone id e template", () => {
    const r = evaluateSalonWhatsAppConfig({
      is_enabled: true,
      phone_number_id: "123456",
      appointment_reminder_enabled: true,
      appointment_reminder_template_name: "appointment_reminder_it",
    });
    expect(r.ready).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("non ready senza phone number id", () => {
    const r = evaluateSalonWhatsAppConfig({
      is_enabled: true,
      phone_number_id: "",
      appointment_reminder_enabled: true,
      envTemplateName: "tpl",
    });
    expect(r.ready).toBe(false);
    expect(r.issues.some((i) => i.includes("Phone Number ID"))).toBe(true);
  });

  it("non richiede template se reminder disattivato", () => {
    const r = evaluateSalonWhatsAppConfig({
      is_enabled: true,
      phone_number_id: "99",
      appointment_reminder_enabled: false,
    });
    expect(r.ready).toBe(true);
  });
});

describe("appointmentReminderStatuses", () => {
  it("riconosce stati canonici", () => {
    expect(isAppointmentReminderStatus("sent")).toBe(true);
    expect(isAppointmentReminderStatus("skipped")).toBe(true);
    expect(isAppointmentReminderStatus("bogus")).toBe(false);
  });

  it("normalizza legacy error/processing", () => {
    expect(normalizeReminderStatusForDisplay("error")).toBe("failed");
    expect(normalizeReminderStatusForDisplay("processing")).toBe("pending");
  });
});

describe("customer_code contract", () => {
  it("formato CLI progressivo", () => {
    expect(/^CLI-\d{6}$/.test("CLI-000042")).toBe(true);
  });
});
