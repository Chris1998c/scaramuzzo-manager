import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/integrations/whatsappGraph", () => ({
  normalizePhoneForWhatsAppTo: vi.fn((raw: string) => {
    const digits = String(raw).replace(/\D/g, "");
    if (!digits) return null;
    return digits.startsWith("39") ? digits : `39${digits}`;
  }),
  sendWhatsAppTemplateMessage: vi.fn(),
}));

import { sendWhatsAppTemplateMessage } from "@/lib/integrations/whatsappGraph";
import {
  processAppointmentReminders,
  resolveAppointmentReminderVenue,
  type ReminderCandidateRow,
} from "@/lib/integrations/appointmentReminderProcessor";

const SHARED_SENDER_DISPLAY = "Scaramuzzo";
const SHARED_PHONE_NUMBER_ID = "1413913078469164";

function candidate(
  partial: Pick<ReminderCandidateRow, "appointment_id" | "salon_id" | "salon_name"> &
    Partial<ReminderCandidateRow>,
): ReminderCandidateRow {
  return {
    customer_id: `cust-${partial.appointment_id}`,
    customer_phone: "3331234567",
    customer_first_name: "Giulia",
    appointment_starts_at: "2026-03-15T09:30:00.000Z",
    wa_phone_number_id: SHARED_PHONE_NUMBER_ID,
    wa_is_enabled: true,
    wa_display_name: SHARED_SENDER_DISPLAY,
    appointment_reminder_template_name: "appointment_reminder",
    appointment_reminder_template_lang: "it",
    ...partial,
  };
}

function mockSupabaseOk(): SupabaseClient {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe("resolveAppointmentReminderVenue", () => {
  it("usa salon_name e ignora display_name mittente", () => {
    expect(
      resolveAppointmentReminderVenue({ salon_name: "Roma" }),
    ).toBe("Roma");
    expect(resolveAppointmentReminderVenue({ salon_name: "  Corigliano  " })).toBe(
      "Corigliano",
    );
    expect(resolveAppointmentReminderVenue({ salon_name: "" })).toBe("Salone");
    expect(resolveAppointmentReminderVenue({ salon_name: null })).toBe("Salone");
  });
});

describe("processAppointmentReminders venue {{4}}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValue({
      ok: true,
      providerMessageId: "wamid.test",
    });
  });

  it("stesso mittente Scaramuzzo, sedi diverse → {{4}} = nome sede appuntamento", async () => {
    const rows = [
      candidate({ appointment_id: 101, salon_id: 1, salon_name: "Roma" }),
      candidate({ appointment_id: 102, salon_id: 2, salon_name: "Corigliano" }),
      candidate({ appointment_id: 103, salon_id: 3, salon_name: "Castrovillari" }),
      candidate({ appointment_id: 104, salon_id: 4, salon_name: "Cosenza" }),
    ];

    const result = await processAppointmentReminders(mockSupabaseOk(), rows, {
      accessToken: "test-token",
      defaultTemplateName: "appointment_reminder",
      defaultTemplateLang: "it",
    });

    expect(result).toEqual({ processed: 4, sent: 4, skipped: 0, failed: 0 });
    expect(sendWhatsAppTemplateMessage).toHaveBeenCalledTimes(4);

    const venues = vi
      .mocked(sendWhatsAppTemplateMessage)
      .mock.calls.map((call) => call[0].bodyParameters[3]);

    expect(venues).toEqual(["Roma", "Corigliano", "Castrovillari", "Cosenza"]);
    expect(new Set(venues).size).toBe(4);

    for (const call of vi.mocked(sendWhatsAppTemplateMessage).mock.calls) {
      const args = call[0];
      expect(args.phoneNumberId).toBe(SHARED_PHONE_NUMBER_ID);
      expect(args.templateName).toBe("appointment_reminder");
      expect(args.bodyParameters[0]).toBe("Giulia");
      expect(args.bodyParameters[3]).not.toBe(SHARED_SENDER_DISPLAY);
      expect(args.bodyParameters).toHaveLength(4);
    }
  });
});
