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
  | { ok: false; error: string };

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
      return { ok: false, error: summarizeWhatsAppGraphError(json) };
    }

    const messages = json?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return { ok: false, error: summarizeWhatsAppGraphError(json) };
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
      JSON.stringify({ error: "WHATSAPP_ACCESS_TOKEN non configurato" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!envTemplateName) {
    return new Response(
      JSON.stringify({
        error: "WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME non configurato",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
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

    const { error: claimErr } = await supabaseAdmin
      .from("appointment_whatsapp_reminders")
      .insert({
        appointment_id: appointmentId,
        salon_id: row.salon_id,
        customer_id: row.customer_id,
        status: "processing",
        scheduled_for: scheduledFor,
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

    const finalizeError = async (message: string): Promise<void> => {
      const { error: upErr } = await supabaseAdmin
        .from("appointment_whatsapp_reminders")
        .update({
          status: "error",
          error_message: message.slice(0, 2000),
        })
        .eq("appointment_id", appointmentId);
      if (upErr) {
        console.error("[appointment-reminders] finalize error", upErr);
      }
      failed += 1;
    };

    if (!row.wa_is_enabled || !String(row.wa_phone_number_id ?? "").trim()) {
      await finalizeError(
        "Salone senza WhatsApp abilitato o senza Phone Number ID.",
      );
      continue;
    }

    const to = normalizePhoneForWhatsAppTo(row.customer_phone ?? "");
    if (!to) {
      await finalizeError("Telefono cliente non valido per WhatsApp.");
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

    const templateName =
      String(row.appointment_reminder_template_name ?? "").trim() ||
      envTemplateName;
    const templateLang =
      String(row.appointment_reminder_template_lang ?? "").trim() ||
      envTemplateLang;

    if (!templateName) {
      await finalizeError(
        "Nome template reminder non configurato (salone né ambiente).",
      );
      continue;
    }

    const send = await sendWhatsAppTemplateMessage({
      accessToken: token,
      phoneNumberId: String(row.wa_phone_number_id).trim(),
      toDigits: to,
      templateName,
      templateLanguageCode: templateLang,
      bodyParameters: bodyParams,
    });

    if (!send.ok) {
      await finalizeError(send.error);
      continue;
    }

    const { error: upErr } = await supabaseAdmin
      .from("appointment_whatsapp_reminders")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: send.providerMessageId,
        error_message: null,
      })
      .eq("appointment_id", appointmentId);

    if (upErr) {
      console.error("[appointment-reminders] finalize sent", upErr);
      failed += 1;
      continue;
    }

    sent += 1;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: rows.length,
      sent,
      skipped,
      failed,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
