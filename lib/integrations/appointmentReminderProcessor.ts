import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizePhoneForWhatsAppTo,
  sendWhatsAppTemplateMessage,
} from "@/lib/integrations/whatsappGraph";
import {
  APPOINTMENT_REMINDER_MAX_RETRIES,
  RETRY_CLAIM_LEASE_MS,
  computeNextRetryAt,
  evaluateReminderRetryPreconditions,
} from "@/lib/whatsapp/appointmentReminderRetryPolicy";
import type { AppointmentReminderStatus } from "@/lib/whatsapp/appointmentReminderStatuses";
import {
  shouldApplyDeliveryStatus,
  sortDeliveryEventsForReplay,
  type WhatsAppDeliveryStatus,
} from "@/lib/whatsapp/whatsappDeliveryStatus";

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
  retried?: number;
};

export type AppointmentReminderEnv = {
  accessToken: string;
  defaultTemplateName: string;
  defaultTemplateLang: string;
};

/**
 * {{4}} del template appointment_reminder = sede dell'appuntamento (salons.name),
 * non il display_name Meta del mittente condiviso tra sedi.
 */
export function resolveAppointmentReminderVenue(row: {
  salon_name?: string | null;
}): string {
  return String(row.salon_name ?? "").trim() || "Salone";
}

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (String(err.code) === "23505") return true;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("duplicate") || m.includes("unique constraint");
}

export function formatItDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "long",
    timeZone: "Europe/Rome",
  }).format(d);
}

export function formatItTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("it-IT", {
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(d);
}

async function updateReminder(
  supabase: SupabaseClient,
  appointmentId: number,
  patch: Record<string, unknown>,
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

type FailedPatch = {
  status: "failed";
  error_message: string;
  phone: string | null;
  template_name: string | null;
  retryable: boolean;
  retry_count?: number;
  next_retry_at?: string | null;
};

function buildFailedPatch(params: {
  message: string;
  phone: string | null;
  templateName: string | null;
  retryable: boolean;
  currentRetryCount: number;
  /** Se true, incrementa retry_count (solo dopo un tentativo di retry). */
  bumpRetryCount: boolean;
}): FailedPatch {
  const retryCount = params.bumpRetryCount
    ? params.currentRetryCount + 1
    : params.currentRetryCount;
  const canRetry =
    params.retryable && retryCount < APPOINTMENT_REMINDER_MAX_RETRIES;
  const next = canRetry ? computeNextRetryAt(retryCount) : null;
  return {
    status: "failed",
    error_message: params.message.slice(0, 2000),
    phone: params.phone,
    template_name: params.templateName,
    retryable: canRetry,
    retry_count: retryCount,
    next_retry_at: next ? next.toISOString() : null,
  };
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

    // Colonne retry usano DEFAULT in migration: omesso per compatibilità pre-migrazione.
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
        status: "skipped" satisfies AppointmentReminderStatus,
        error_message: message.slice(0, 2000),
        phone: to,
        template_name: templateName || null,
        retryable: false,
        next_retry_at: null,
      });
      if (ok) skipped += 1;
      else failed += 1;
    };

    const markFailed = async (message: string, retryable: boolean) => {
      const ok = await updateReminder(
        supabase,
        appointmentId,
        buildFailedPatch({
          message,
          phone: to,
          templateName: templateName || null,
          retryable,
          currentRetryCount: 0,
          bumpRetryCount: false,
        }),
      );
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
      await markFailed("Nome template reminder non configurato (salone né ambiente).", false);
      continue;
    }

    const firstName = String(row.customer_first_name ?? "").trim() || "Cliente";
    const venue = resolveAppointmentReminderVenue(row);

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
      await markFailed(send.error, send.retryable === true);
      continue;
    }

    const ok = await updateReminder(supabase, appointmentId, {
      status: "sent" satisfies AppointmentReminderStatus,
      sent_at: new Date().toISOString(),
      provider_message_id: send.providerMessageId,
      error_message: null,
      phone: to,
      template_name: templateName,
      retryable: false,
      next_retry_at: null,
    });

    if (ok) {
      sent += 1;
      if (send.providerMessageId) {
        await replayDeliveryEventsForMessage(supabase, send.providerMessageId);
      }
    } else failed += 1;
  }

  return { processed: rows.length, sent, skipped, failed };
}

type RetryRow = {
  appointment_id: number;
  salon_id: number;
  customer_id: string;
  scheduled_for: string;
  phone: string | null;
  template_name: string | null;
  retry_count: number;
  provider_message_id: string | null;
};

/**
 * Claim atomico anti doppio-invio tra cron Next/Edge concorrenti.
 * Sposta next_retry_at in avanti (lease); solo un worker ottiene la riga.
 */
export async function claimAppointmentReminderRetry(
  supabase: SupabaseClient,
  row: Pick<RetryRow, "appointment_id" | "retry_count">,
  now: Date,
): Promise<RetryRow | null> {
  const leaseUntil = new Date(now.getTime() + RETRY_CLAIM_LEASE_MS).toISOString();
  const { data, error } = await supabase
    .from("appointment_whatsapp_reminders")
    .update({ next_retry_at: leaseUntil })
    .eq("appointment_id", row.appointment_id)
    .eq("status", "failed")
    .eq("retryable", true)
    .eq("retry_count", row.retry_count)
    .is("provider_message_id", null)
    .lte("next_retry_at", now.toISOString())
    .lt("retry_count", APPOINTMENT_REMINDER_MAX_RETRIES)
    .select(
      "appointment_id, salon_id, customer_id, scheduled_for, phone, template_name, retry_count, provider_message_id",
    )
    .maybeSingle();

  if (error) {
    console.error("[appointment-reminders] retry claim", error);
    return null;
  }
  return (data as RetryRow | null) ?? null;
}

/**
 * Retry limitato solo per failed recuperabili senza provider_message_id.
 * Rilegge appuntamento + config salone prima di ogni invio.
 */
export async function retryFailedAppointmentReminders(
  supabase: SupabaseClient,
  env: AppointmentReminderEnv,
  now = new Date(),
): Promise<AppointmentReminderProcessResult> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let retried = 0;

  const { data: due, error: dueErr } = await supabase
    .from("appointment_whatsapp_reminders")
    .select(
      "appointment_id, salon_id, customer_id, scheduled_for, phone, template_name, retry_count, provider_message_id",
    )
    .eq("status", "failed")
    .eq("retryable", true)
    .is("provider_message_id", null)
    .lte("next_retry_at", now.toISOString())
    .lt("retry_count", APPOINTMENT_REMINDER_MAX_RETRIES)
    .order("next_retry_at", { ascending: true })
    .limit(50);

  if (dueErr) {
    console.error("[appointment-reminders] retry query", dueErr);
    return { processed: 0, sent: 0, skipped: 0, failed: 0, retried: 0 };
  }

  const rows = (due ?? []) as RetryRow[];

  for (const candidate of rows) {
    const claimed = await claimAppointmentReminderRetry(supabase, candidate, now);
    if (!claimed) {
      // Un altro worker ha già preso il lease (o riga non più due).
      continue;
    }

    retried += 1;
    const row = claimed;
    const appointmentId = row.appointment_id;

    // Difesa: mai retry se Graph aveva già accettato (wamid presente).
    if (row.provider_message_id) {
      await updateReminder(supabase, appointmentId, {
        retryable: false,
        next_retry_at: null,
      });
      skipped += 1;
      continue;
    }

    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .select("id, status, start_time, salon_id, customer_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptErr || !appt) {
      await updateReminder(
        supabase,
        appointmentId,
        buildFailedPatch({
          message: "Appuntamento non trovato in retry.",
          phone: row.phone,
          templateName: row.template_name,
          retryable: false,
          currentRetryCount: row.retry_count,
          bumpRetryCount: true,
        }),
      );
      failed += 1;
      continue;
    }

    const { data: salonWa } = await supabase
      .from("salon_whatsapp_settings")
      .select(
        "is_enabled, appointment_reminder_enabled, phone_number_id, appointment_reminder_template_name, appointment_reminder_template_lang",
      )
      .eq("salon_id", appt.salon_id)
      .maybeSingle();

    const { data: salon } = await supabase
      .from("salons")
      .select("name")
      .eq("id", appt.salon_id)
      .maybeSingle();

    const { data: customer } = await supabase
      .from("customers")
      .select("first_name, phone")
      .eq("id", appt.customer_id)
      .maybeSingle();

    const pre = evaluateReminderRetryPreconditions({
      reminderScheduledForIso: row.scheduled_for,
      appointment: {
        status: appt.status,
        startTimeIso: appt.start_time,
      },
      salon: {
        isEnabled: !!salonWa?.is_enabled,
        reminderEnabled: salonWa?.appointment_reminder_enabled !== false && !!salonWa,
        phoneNumberId: salonWa?.phone_number_id,
      },
      now,
    });

    if (!pre.ok) {
      if (pre.markSkipped) {
        const ok = await updateReminder(supabase, appointmentId, {
          status: "skipped",
          error_message: pre.reason.slice(0, 2000),
          retryable: false,
          next_retry_at: null,
        });
        if (ok) skipped += 1;
        else failed += 1;
      } else {
        failed += 1;
      }
      continue;
    }

    const phoneRaw = String(customer?.phone ?? row.phone ?? "");
    const to = normalizePhoneForWhatsAppTo(phoneRaw);
    if (!to) {
      const ok = await updateReminder(supabase, appointmentId, {
        status: "skipped",
        error_message: "Telefono cliente non valido per WhatsApp (retry).",
        retryable: false,
        next_retry_at: null,
      });
      if (ok) skipped += 1;
      else failed += 1;
      continue;
    }

    const templateName =
      String(salonWa?.appointment_reminder_template_name ?? "").trim() ||
      String(row.template_name ?? "").trim() ||
      env.defaultTemplateName;
    const templateLang =
      String(salonWa?.appointment_reminder_template_lang ?? "").trim() ||
      env.defaultTemplateLang;

    if (!templateName) {
      await updateReminder(
        supabase,
        appointmentId,
        buildFailedPatch({
          message: "Template reminder mancante in retry.",
          phone: to,
          templateName: null,
          retryable: false,
          currentRetryCount: row.retry_count,
          bumpRetryCount: true,
        }),
      );
      failed += 1;
      continue;
    }

    const startIso = String(appt.start_time);
    const firstName = String(customer?.first_name ?? "").trim() || "Cliente";
    const venue = resolveAppointmentReminderVenue({ salon_name: salon?.name });
    const bodyParams = [
      firstName,
      formatItDate(startIso),
      formatItTime(startIso),
      venue,
    ];

    const send = await sendWhatsAppTemplateMessage({
      accessToken: env.accessToken,
      phoneNumberId: String(salonWa!.phone_number_id).trim(),
      toDigits: to,
      templateName,
      templateLanguageCode: templateLang,
      bodyParameters: bodyParams,
    });

    if (!send.ok) {
      await updateReminder(
        supabase,
        appointmentId,
        buildFailedPatch({
          message: send.error,
          phone: to,
          templateName,
          retryable: send.retryable === true,
          currentRetryCount: row.retry_count,
          bumpRetryCount: true,
        }),
      );
      failed += 1;
      continue;
    }

    const ok = await updateReminder(supabase, appointmentId, {
      status: "sent",
      sent_at: now.toISOString(),
      provider_message_id: send.providerMessageId,
      error_message: null,
      phone: to,
      template_name: templateName,
      retryable: false,
      next_retry_at: null,
      scheduled_for: startIso,
    });
    if (ok) {
      sent += 1;
      if (send.providerMessageId) {
        await replayDeliveryEventsForMessage(supabase, send.providerMessageId);
      }
    } else failed += 1;
  }

  return { processed: rows.length, sent, skipped, failed, retried };
}

export type ApplyDeliveryResult =
  | { applied: true }
  | {
      applied: false;
      reason: "duplicate_event" | "unknown_message" | "stale_status" | "db_error";
    };

async function patchReminderDelivery(
  supabase: SupabaseClient,
  appointmentId: number,
  providerMessageId: string,
  deliveryStatus: WhatsAppDeliveryStatus,
  errorMessage: string | null,
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    delivery_status: deliveryStatus,
    delivery_updated_at: new Date().toISOString(),
  };
  if (deliveryStatus === "failed") {
    patch.delivery_error = errorMessage;
  } else {
    patch.delivery_error = null;
  }

  const { error: upErr } = await supabase
    .from("appointment_whatsapp_reminders")
    .update(patch)
    .eq("appointment_id", appointmentId)
    .eq("provider_message_id", providerMessageId);

  if (upErr) {
    console.error("[whatsapp-webhook] delivery update", upErr);
    return false;
  }
  return true;
}

/**
 * Replay eventi webhook arrivati prima del salvataggio di provider_message_id.
 */
export async function replayDeliveryEventsForMessage(
  supabase: SupabaseClient,
  providerMessageId: string,
): Promise<void> {
  const mid = String(providerMessageId ?? "").trim();
  if (!mid) return;

  const { data: reminder, error: findErr } = await supabase
    .from("appointment_whatsapp_reminders")
    .select("appointment_id, delivery_status")
    .eq("provider_message_id", mid)
    .maybeSingle();

  if (findErr || !reminder) return;

  const { data: events, error: evErr } = await supabase
    .from("whatsapp_webhook_events")
    .select("delivery_status, provider_timestamp, error_message")
    .eq("provider_message_id", mid);

  if (evErr || !events?.length) return;

  const sorted = sortDeliveryEventsForReplay(
    events.map((e) => ({
      deliveryStatus: e.delivery_status as WhatsAppDeliveryStatus,
      providerTimestamp: String(e.provider_timestamp ?? ""),
      errorMessage: (e.error_message as string | null) ?? null,
    })),
  );

  let current = reminder.delivery_status as string | null;
  for (const ev of sorted) {
    if (!shouldApplyDeliveryStatus(current, ev.deliveryStatus)) continue;
    const ok = await patchReminderDelivery(
      supabase,
      reminder.appointment_id,
      mid,
      ev.deliveryStatus,
      ev.errorMessage,
    );
    if (ok) current = ev.deliveryStatus;
  }
}

/**
 * Associa uno status webhook a reminder via provider_message_id (idempotente + monotono).
 * Eventi early (reminder non ancora con wamid) restano in whatsapp_webhook_events per replay.
 */
export async function applyWhatsAppDeliveryStatus(
  supabase: SupabaseClient,
  event: {
    providerMessageId: string;
    deliveryStatus: WhatsAppDeliveryStatus;
    providerTimestamp: string;
    errorMessage: string | null;
  },
): Promise<ApplyDeliveryResult> {
  const { error: insertErr } = await supabase.from("whatsapp_webhook_events").insert({
    provider_message_id: event.providerMessageId,
    delivery_status: event.deliveryStatus,
    provider_timestamp: event.providerTimestamp || "",
    error_message: event.errorMessage,
  });

  if (insertErr) {
    if (isUniqueViolation(insertErr)) {
      return { applied: false, reason: "duplicate_event" };
    }
    console.error("[whatsapp-webhook] event insert", insertErr);
    return { applied: false, reason: "db_error" };
  }

  const { data: reminder, error: findErr } = await supabase
    .from("appointment_whatsapp_reminders")
    .select("appointment_id, delivery_status")
    .eq("provider_message_id", event.providerMessageId)
    .maybeSingle();

  if (findErr) {
    console.error("[whatsapp-webhook] reminder lookup", findErr);
    return { applied: false, reason: "db_error" };
  }
  if (!reminder) {
    // Conservato in whatsapp_webhook_events → replay quando il wamid viene salvato.
    return { applied: false, reason: "unknown_message" };
  }

  if (!shouldApplyDeliveryStatus(reminder.delivery_status, event.deliveryStatus)) {
    return { applied: false, reason: "stale_status" };
  }

  const ok = await patchReminderDelivery(
    supabase,
    reminder.appointment_id,
    event.providerMessageId,
    event.deliveryStatus,
    event.errorMessage,
  );
  return ok ? { applied: true } : { applied: false, reason: "db_error" };
}
