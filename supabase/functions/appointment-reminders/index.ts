/**
 * Supabase Edge Function: appointment-reminders
 * Stessa logica di POST /api/cron/appointment-reminders (Vercel).
 * Trigger: Supabase pg_cron + pg_net con Bearer da Vault (CRON_SECRET).
 *
 * Deploy: supabase functions deploy appointment-reminders --no-verify-jwt
 *
 * Secrets (Dashboard → Edge Functions → appointment-reminders):
 * - CRON_SECRET (stesso valore in vault.decrypted_secrets per pg_net)
 * - WHATSAPP_ACCESS_TOKEN
 * - WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME
 * - WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_LANG (opzionale)
 * - WHATSAPP_OTP_TEMPLATE_LANG (fallback template lang)
 * - WHATSAPP_GRAPH_API_VERSION (opzionale, default v21.0)
 *
 * Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type ReminderRow = {
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

function verifyCronSecret(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET")?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

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

function graphVersion(): string {
  return Deno.env.get("WHATSAPP_GRAPH_API_VERSION")?.trim() || "v21.0";
}

function whatsappGraphMessagesUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/messages`;
}

function normalizePhoneForWhatsAppTo(phoneRaw: string): string | null {
  let d = phoneRaw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) d = `39${d}`;
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

function summarizeWhatsAppGraphError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Risposta Meta non valida.";
  const err = (payload as { error?: { message?: string; error_user_msg?: string } })
    .error;
  const msg =
    err?.error_user_msg?.trim() ||
    err?.message?.trim() ||
    "Invio WhatsApp rifiutato.";
  return msg.length > 280 ? `${msg.slice(0, 277)}...` : msg;
}

type SendWhatsAppTemplateResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

const MAX_RETRIES = 3;
const BACKOFF_MS = [15 * 60 * 1000, 60 * 60 * 1000, 4 * 60 * 60 * 1000] as const;

const DELIVERY_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

function shouldApplyDelivery(current: string | null | undefined, incoming: string): boolean {
  const cur = String(current ?? "").trim().toLowerCase();
  if (!cur) return true;
  if (cur === incoming) return false;
  if (cur === "read") return false;
  if (cur === "failed") return incoming === "delivered" || incoming === "read";
  const a = DELIVERY_RANK[cur] ?? 0;
  const b = DELIVERY_RANK[incoming] ?? 0;
  return b > a;
}

async function replayEarlyDeliveryEvents(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  providerMessageId: string,
): Promise<void> {
  const mid = String(providerMessageId ?? "").trim();
  if (!mid) return;
  const { data: reminder } = await supabaseAdmin
    .from("appointment_whatsapp_reminders")
    .select("appointment_id, delivery_status")
    .eq("provider_message_id", mid)
    .maybeSingle();
  if (!reminder) return;
  const { data: events } = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("delivery_status, provider_timestamp, error_message")
    .eq("provider_message_id", mid);
  if (!events?.length) return;
  const sorted = [...events].sort((a: { provider_timestamp?: string; delivery_status: string }, b: { provider_timestamp?: string; delivery_status: string }) => {
    const ta = Number(a.provider_timestamp);
    const tb = Number(b.provider_timestamp);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return DELIVERY_RANK[a.delivery_status] - DELIVERY_RANK[b.delivery_status];
  });
  let current = reminder.delivery_status as string | null;
  for (const ev of sorted) {
    const st = String(ev.delivery_status);
    if (!shouldApplyDelivery(current, st)) continue;
    const patch: Record<string, unknown> = {
      delivery_status: st,
      delivery_updated_at: new Date().toISOString(),
      delivery_error: st === "failed" ? ev.error_message ?? null : null,
    };
    const { error } = await supabaseAdmin
      .from("appointment_whatsapp_reminders")
      .update(patch)
      .eq("appointment_id", reminder.appointment_id)
      .eq("provider_message_id", mid);
    if (!error) current = st;
  }
}

function classifyRetryable(httpStatus?: number, code?: number, aborted?: boolean, network?: boolean): boolean {
  if (aborted || network) return false;
  if (httpStatus === 429 || httpStatus === 500 || httpStatus === 502 || httpStatus === 503) return true;
  if (code === 130429 || code === 131048 || code === 133016) return true;
  return false;
}

function nextRetryIso(retryCount: number): string | null {
  if (retryCount >= MAX_RETRIES) return null;
  const idx = Math.min(retryCount, BACKOFF_MS.length - 1);
  return new Date(Date.now() + BACKOFF_MS[idx]!).toISOString();
}

function extractGraphCode(payload: unknown): number | undefined {
  const err =
    payload && typeof payload === "object"
      ? (payload as { error?: { code?: number } }).error
      : undefined;
  return typeof err?.code === "number" ? err.code : undefined;
}

async function sendWhatsAppTemplateMessage(params: {
  accessToken: string;
  phoneNumberId: string;
  toDigits: string;
  templateName: string;
  templateLanguageCode: string;
  bodyParameters: string[];
}): Promise<SendWhatsAppTemplateResult> {
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.toDigits,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.templateLanguageCode },
      components: [
        {
          type: "body",
          parameters: params.bodyParameters.map((text) => ({
            type: "text",
            text: String(text).slice(0, 1024),
          })),
        },
      ],
    },
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(whatsappGraphMessagesUrl(params.phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!res.ok) {
      const code = extractGraphCode(json);
      return {
        ok: false,
        error: summarizeWhatsAppGraphError(json),
        retryable: classifyRetryable(res.status, code),
      };
    }

    const messages = json?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return {
        ok: false,
        error: summarizeWhatsAppGraphError(json),
        retryable: false,
      };
    }

    const mid = (messages[0] as { id?: string })?.id ?? null;
    return { ok: true, providerMessageId: mid };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "Timeout durante l'invio WhatsApp."
        : "Errore di rete durante l'invio WhatsApp.",
      retryable: classifyRetryable(undefined, undefined, aborted, !aborted),
    };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!verifyCronSecret(req)) {
    return new Response(JSON.stringify({ error: "Non autorizzato" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const envTemplateName = Deno.env.get("WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME")?.trim();
  const envTemplateLang =
    Deno.env.get("WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_LANG")?.trim() ||
    Deno.env.get("WHATSAPP_OTP_TEMPLATE_LANG")?.trim() ||
    "it";

  if (!token) {
    return new Response(
      JSON.stringify({
        error: "WHATSAPP_ACCESS_TOKEN non configurato. Imposta il token Meta nelle secrets Edge.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!envTemplateName) {
    return new Response(
      JSON.stringify({
        error:
          "WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME non configurato. Imposta template su Edge o per salone in Impostazioni.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Supabase env mancanti" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: candidates, error: rpcErr } = await supabaseAdmin.rpc(
    "appointments_for_whatsapp_reminder_v1",
  );

  if (rpcErr) {
    return new Response(JSON.stringify({ error: rpcErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rows = (candidates ?? []) as ReminderRow[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const appointmentId = row.appointment_id;
    const scheduledFor = row.appointment_starts_at;
    const to = normalizePhoneForWhatsAppTo(row.customer_phone ?? "");

    const templateName =
      String(row.appointment_reminder_template_name ?? "").trim() ||
      envTemplateName;
    const templateLang =
      String(row.appointment_reminder_template_lang ?? "").trim() ||
      envTemplateLang;

    const { error: claimErr } = await supabaseAdmin
      .from("appointment_whatsapp_reminders")
      .insert({
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

    const markSkipped = async (message: string): Promise<void> => {
      const { error: upErr } = await supabaseAdmin
        .from("appointment_whatsapp_reminders")
        .update({
          status: "skipped",
          error_message: message.slice(0, 2000),
          phone: to,
          template_name: templateName || null,
        })
        .eq("appointment_id", appointmentId);
      if (upErr) console.error("[appointment-reminders] finalize skipped", upErr);
      else skipped += 1;
    };

    const markFailed = async (
      message: string,
      retryable: boolean,
    ): Promise<void> => {
      const canRetry = retryable && 0 < MAX_RETRIES;
      const { error: upErr } = await supabaseAdmin
        .from("appointment_whatsapp_reminders")
        .update({
          status: "failed",
          error_message: message.slice(0, 2000),
          phone: to,
          template_name: templateName || null,
          retryable: canRetry,
          retry_count: 0,
          next_retry_at: canRetry ? nextRetryIso(0) : null,
        })
        .eq("appointment_id", appointmentId);
      if (upErr) console.error("[appointment-reminders] finalize failed", upErr);
      else failed += 1;
    };

    if (!row.wa_is_enabled || !String(row.wa_phone_number_id ?? "").trim()) {
      await markSkipped(
        "Salone senza WhatsApp abilitato o senza Phone Number ID.",
      );
      continue;
    }

    if (!to) {
      await markSkipped("Telefono cliente non valido per WhatsApp.");
      continue;
    }

    if (!templateName) {
      await markFailed(
        "Nome template reminder non configurato (salone né ambiente).",
        false,
      );
      continue;
    }

    const firstName = String(row.customer_first_name ?? "").trim() || "Cliente";
    // {{4}} = sede appuntamento (salons.name via RPC), non display_name mittente Meta.
    const venue = String(row.salon_name ?? "").trim() || "Salone";

    const bodyParams = [
      firstName,
      formatItDate(scheduledFor),
      formatItTime(scheduledFor),
      venue,
    ];

    const send = await sendWhatsAppTemplateMessage({
      accessToken: token,
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

    const { error: upErr } = await supabaseAdmin
      .from("appointment_whatsapp_reminders")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: send.providerMessageId,
        error_message: null,
        phone: to,
        template_name: templateName,
        retryable: false,
        next_retry_at: null,
      })
      .eq("appointment_id", appointmentId);

    if (upErr) {
      console.error("[appointment-reminders] finalize sent", upErr);
      failed += 1;
      continue;
    }

    sent += 1;
    if (send.providerMessageId) {
      await replayEarlyDeliveryEvents(supabaseAdmin, send.providerMessageId);
    }
  }

  // Retry controllato (stessa policy Next): solo failed recuperabili senza wamid.
  let retrySent = 0;
  let retrySkipped = 0;
  let retryFailed = 0;
  const nowIso = new Date().toISOString();
  const { data: dueRetries } = await supabaseAdmin
    .from("appointment_whatsapp_reminders")
    .select(
      "appointment_id, salon_id, scheduled_for, phone, template_name, retry_count, provider_message_id",
    )
    .eq("status", "failed")
    .eq("retryable", true)
    .is("provider_message_id", null)
    .lte("next_retry_at", nowIso)
    .lt("retry_count", MAX_RETRIES)
    .order("next_retry_at", { ascending: true })
    .limit(50);

  for (const candidate of dueRetries ?? []) {
    const retryCount = Number(candidate.retry_count ?? 0);
    const leaseUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    // Claim atomico: evita doppio invio se Next ed Edge girano insieme.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("appointment_whatsapp_reminders")
      .update({ next_retry_at: leaseUntil })
      .eq("appointment_id", candidate.appointment_id)
      .eq("status", "failed")
      .eq("retryable", true)
      .eq("retry_count", retryCount)
      .is("provider_message_id", null)
      .lte("next_retry_at", nowIso)
      .lt("retry_count", MAX_RETRIES)
      .select(
        "appointment_id, salon_id, scheduled_for, phone, template_name, retry_count, provider_message_id",
      )
      .maybeSingle();

    if (claimErr || !claimed) continue;

    const row = claimed;
    const appointmentId = row.appointment_id as number;
    if (row.provider_message_id) {
      await supabaseAdmin
        .from("appointment_whatsapp_reminders")
        .update({ retryable: false, next_retry_at: null })
        .eq("appointment_id", appointmentId);
      retrySkipped += 1;
      continue;
    }

    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select("status, start_time, salon_id, customer_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (!appt || String(appt.status).toLowerCase() !== "scheduled") {
      await supabaseAdmin
        .from("appointment_whatsapp_reminders")
        .update({
          status: "skipped",
          error_message: "Appuntamento non più scheduled (retry).",
          retryable: false,
          next_retry_at: null,
        })
        .eq("appointment_id", appointmentId);
      retrySkipped += 1;
      continue;
    }

    const startMs = Date.parse(String(appt.start_time));
    const scheduledMs = Date.parse(String(row.scheduled_for));
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(scheduledMs) ||
      Math.abs(startMs - scheduledMs) > 60_000 ||
      startMs <= Date.now()
    ) {
      await supabaseAdmin
        .from("appointment_whatsapp_reminders")
        .update({
          status: "skipped",
          error_message: "Appuntamento modificato o trascorso (retry).",
          retryable: false,
          next_retry_at: null,
        })
        .eq("appointment_id", appointmentId);
      retrySkipped += 1;
      continue;
    }

    const { data: salonWa } = await supabaseAdmin
      .from("salon_whatsapp_settings")
      .select(
        "is_enabled, appointment_reminder_enabled, phone_number_id, appointment_reminder_template_name, appointment_reminder_template_lang",
      )
      .eq("salon_id", appt.salon_id)
      .maybeSingle();

    if (
      !salonWa?.is_enabled ||
      salonWa.appointment_reminder_enabled === false ||
      !String(salonWa.phone_number_id ?? "").trim()
    ) {
      await supabaseAdmin
        .from("appointment_whatsapp_reminders")
        .update({
          status: "skipped",
          error_message: "WhatsApp/reminder disattivati (retry).",
          retryable: false,
          next_retry_at: null,
        })
        .eq("appointment_id", appointmentId);
      retrySkipped += 1;
      continue;
    }

    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("first_name, phone")
      .eq("id", appt.customer_id)
      .maybeSingle();
    const { data: salon } = await supabaseAdmin
      .from("salons")
      .select("name")
      .eq("id", appt.salon_id)
      .maybeSingle();

    const to = normalizePhoneForWhatsAppTo(
      String(customer?.phone ?? row.phone ?? ""),
    );
    if (!to) {
      await supabaseAdmin
        .from("appointment_whatsapp_reminders")
        .update({
          status: "skipped",
          error_message: "Telefono non valido (retry).",
          retryable: false,
          next_retry_at: null,
        })
        .eq("appointment_id", appointmentId);
      retrySkipped += 1;
      continue;
    }

    const templateName =
      String(salonWa.appointment_reminder_template_name ?? "").trim() ||
      String(row.template_name ?? "").trim() ||
      envTemplateName;
    const templateLang =
      String(salonWa.appointment_reminder_template_lang ?? "").trim() ||
      envTemplateLang;
    const startIso = String(appt.start_time);
    const firstName = String(customer?.first_name ?? "").trim() || "Cliente";
    const venue = String(salon?.name ?? "").trim() || "Salone";

    const send = await sendWhatsAppTemplateMessage({
      accessToken: token!,
      phoneNumberId: String(salonWa.phone_number_id).trim(),
      toDigits: to,
      templateName,
      templateLanguageCode: templateLang,
      bodyParameters: [
        firstName,
        formatItDate(startIso),
        formatItTime(startIso),
        venue,
      ],
    });

    const newRetryCount = retryCount + 1;
    if (!send.ok) {
      const canRetry = send.retryable === true && newRetryCount < MAX_RETRIES;
      await supabaseAdmin
        .from("appointment_whatsapp_reminders")
        .update({
          status: "failed",
          error_message: send.error.slice(0, 2000),
          phone: to,
          template_name: templateName,
          retryable: canRetry,
          retry_count: newRetryCount,
          next_retry_at: canRetry ? nextRetryIso(newRetryCount) : null,
        })
        .eq("appointment_id", appointmentId);
      retryFailed += 1;
      continue;
    }

    const { error: upErr } = await supabaseAdmin
      .from("appointment_whatsapp_reminders")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: send.providerMessageId,
        error_message: null,
        phone: to,
        template_name: templateName,
        retryable: false,
        next_retry_at: null,
        scheduled_for: startIso,
      })
      .eq("appointment_id", appointmentId);
    if (upErr) retryFailed += 1;
    else {
      retrySent += 1;
      if (send.providerMessageId) {
        await replayEarlyDeliveryEvents(supabaseAdmin, send.providerMessageId);
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: rows.length,
      sent,
      skipped,
      failed,
      retry: {
        processed: (dueRetries ?? []).length,
        sent: retrySent,
        skipped: retrySkipped,
        failed: retryFailed,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
