// POST /api/cron/appointment-reminders
// Reminder WhatsApp transazionale v1 (stessa logica della Edge Function appointment-reminders).
// Trigger produzione: Supabase pg_cron + pg_net → functions/v1/appointment-reminders (non più Vercel Cron).
// Questa route resta per test manuali con header Authorization: Bearer CRON_SECRET.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalizePhoneForWhatsAppTo,
  sendWhatsAppTemplateMessage,
} from "@/lib/integrations/whatsappGraph";

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
  const secret = process.env.CRON_SECRET?.trim();
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

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function POST(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const envTemplateName =
    process.env.WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME?.trim();
  const envTemplateLang =
    process.env.WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_LANG?.trim() ||
    process.env.WHATSAPP_OTP_TEMPLATE_LANG?.trim() ||
    "it";

  if (!token) {
    return NextResponse.json(
      { error: "WHATSAPP_ACCESS_TOKEN non configurato" },
      { status: 500 }
    );
  }
  if (!envTemplateName) {
    return NextResponse.json(
      {
        error:
          "WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME non configurato",
      },
      { status: 500 }
    );
  }

  const { data: candidates, error: rpcErr } = await supabaseAdmin.rpc(
    "appointments_for_whatsapp_reminder_v1"
  );

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
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

    const finalizeError = async (message: string) => {
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
        "Salone senza WhatsApp abilitato o senza Phone Number ID."
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
      await finalizeError("Nome template reminder non configurato (salone né ambiente).");
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

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    sent,
    skipped,
    failed,
  });
}
