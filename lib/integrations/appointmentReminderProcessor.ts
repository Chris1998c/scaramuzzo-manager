import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizePhoneForWhatsAppTo,
  sendWhatsAppTemplateMessage,
} from "@/lib/integrations/whatsappGraph";
import type { AppointmentReminderStatus } from "@/lib/whatsapp/appointmentReminderStatuses";

export type ReminderCandidateRow = {
  appointment_id: number;
  salon_id: number;
  customer_id: string;
  customer_phone: string;
  customer_first_name: string;
  appointment_starts_at: string;
  salon_name: string;
  wa_phone_number_id: string;
  wa_is_enabled: boolean;
  wa_display_name: string;
  appointment_reminder_template_name: string | null;
  appointment_reminder_template_lang: string | null;
};

export type AppointmentReminderProcessResult = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
};

export type AppointmentReminderEnv = {
  accessToken: string;
  defaultTemplateName: string;
  defaultTemplateLang: string;
};

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (String(err.code) === "23505") return true;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("duplicate") || m.includes("unique constraint");
}

function formatItDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "long",
    timeZone: "Europe/Rome",
  }).format(d);
}

function formatItTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("it-IT", {
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(d);
}

async function updateReminder(
  supabase: SupabaseClient,
  appointmentId: number,
  patch: {
    status: AppointmentReminderStatus;
    error_message?: string | null;
    sent_at?: string | null;
    provider_message_id?: string | null;
    template_name?: string | null;
    phone?: string | null;
  },
): Promise<boolean> {
  const { error } = await supabase
    .from("appointment_whatsapp_reminders")
    .update(patch)
    .eq("appointment_id", appointmentId);
  if (error) {
    console.error("[appointment-reminders] update", error);
    return false;
  }
  return true;
}

/**
 * Processa candidati RPC: claim idempotente + invio template Meta.
 */
export async function processAppointmentReminders(
  supabase: SupabaseClient,
  rows: ReminderCandidateRow[],
  env: AppointmentReminderEnv,
): Promise<AppointmentReminderProcessResult> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const appointmentId = row.appointment_id;
    const scheduledFor = row.appointment_starts_at;
    const to = normalizePhoneForWhatsAppTo(row.customer_phone ?? "");

    const templateName =
      String(row.appointment_reminder_template_name ?? "").trim() ||
      env.defaultTemplateName;
    const templateLang =
      String(row.appointment_reminder_template_lang ?? "").trim() ||
      env.defaultTemplateLang;

    const { error: claimErr } = await supabase.from("appointment_whatsapp_reminders").insert({
      appointment_id: appointmentId,
      salon_id: row.salon_id,
      customer_id: row.customer_id,
      status: "pending",
      scheduled_for: scheduledFor,
      phone: to,
      template_name: templateName || null,
    });

    if (claimErr) {
      if (isUniqueViolation(claimErr)) {
        skipped += 1;
        continue;
      }
      console.error("[appointment-reminders] claim insert", claimErr);
      failed += 1;
      continue;
    }

    const markSkipped = async (message: string) => {
      const ok = await updateReminder(supabase, appointmentId, {
        status: "skipped",
        error_message: message.slice(0, 2000),
        phone: to,
        template_name: templateName || null,
      });
      if (ok) skipped += 1;
      else failed += 1;
    };

    const markFailed = async (message: string) => {
      const ok = await updateReminder(supabase, appointmentId, {
        status: "failed",
        error_message: message.slice(0, 2000),
        phone: to,
        template_name: templateName || null,
      });
      if (ok) failed += 1;
    };

    if (!row.wa_is_enabled || !String(row.wa_phone_number_id ?? "").trim()) {
      await markSkipped("Salone senza WhatsApp abilitato o senza Phone Number ID.");
      continue;
    }

    if (!to) {
      await markSkipped("Telefono cliente non valido per WhatsApp.");
      continue;
    }

    if (!templateName) {
      await markFailed("Nome template reminder non configurato (salone né ambiente).");
      continue;
    }

    const firstName = String(row.customer_first_name ?? "").trim() || "Cliente";
    const venue =
      String(row.wa_display_name ?? "").trim() ||
      String(row.salon_name ?? "").trim() ||
      "Salone";

    const bodyParams = [
      firstName,
      formatItDate(scheduledFor),
      formatItTime(scheduledFor),
      venue,
    ];

    const send = await sendWhatsAppTemplateMessage({
      accessToken: env.accessToken,
      phoneNumberId: String(row.wa_phone_number_id).trim(),
      toDigits: to,
      templateName,
      templateLanguageCode: templateLang,
      bodyParameters: bodyParams,
    });

    if (!send.ok) {
      await markFailed(send.error);
      continue;
    }

    const ok = await updateReminder(supabase, appointmentId, {
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: send.providerMessageId,
      error_message: null,
      phone: to,
      template_name: templateName,
    });

    if (ok) sent += 1;
    else failed += 1;
  }

  return { processed: rows.length, sent, skipped, failed };
}
