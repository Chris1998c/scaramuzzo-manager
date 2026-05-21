// POST /api/cron/appointment-reminders
// Reminder WhatsApp transazionale v1 (stessa logica della Edge Function appointment-reminders).
// Trigger produzione: Supabase pg_cron + pg_net → functions/v1/appointment-reminders (non più Vercel Cron).
// Questa route resta per test manuali con header Authorization: Bearer CRON_SECRET.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  processAppointmentReminders,
  type ReminderCandidateRow,
} from "@/lib/integrations/appointmentReminderProcessor";

function verifyCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
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
      { error: "WHATSAPP_ACCESS_TOKEN non configurato. Imposta il token Meta su Vercel." },
      { status: 503 },
    );
  }
  if (!envTemplateName) {
    return NextResponse.json(
      {
        error:
          "WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME non configurato. Imposta il template reminder su Vercel o per salone in Impostazioni → Canali.",
      },
      { status: 503 },
    );
  }

  const { data: candidates, error: rpcErr } = await supabaseAdmin.rpc(
    "appointments_for_whatsapp_reminder_v1",
  );

  if (rpcErr) {
    return NextResponse.json(
      { error: `RPC reminder non disponibile: ${rpcErr.message}` },
      { status: 500 },
    );
  }

  const rows = (candidates ?? []) as ReminderCandidateRow[];
  const result = await processAppointmentReminders(supabaseAdmin, rows, {
    accessToken: token,
    defaultTemplateName: envTemplateName,
    defaultTemplateLang: envTemplateLang,
  });

  return NextResponse.json({ ok: true, ...result });
}
