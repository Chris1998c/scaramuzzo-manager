import { NextResponse } from "next/server";
import webpush from "web-push";
import { loadCustomerPushConfig } from "@/lib/customer-app/customerPushConfig";
import {
  buildCustomerPushPayload, type PushReminderCandidate,
} from "@/lib/customer-app/customerPushReminder";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function POST(req: Request) {
  let config;
  try { config = await loadCustomerPushConfig(); }
  catch (error) {
    console.error("customer push config", error);
    return NextResponse.json({ error: "Configurazione push non disponibile." }, { status: 503 });
  }
  if (!config.cron_secret || req.headers.get("authorization") !== `Bearer ${config.cron_secret}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  if (!config.public_key || !config.private_key) {
    return NextResponse.json({ error: "Chiavi push non configurate." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin.rpc("appointments_for_customer_push_v1");
  if (error) {
    console.error("customer push candidates", error);
    return NextResponse.json({ error: "Candidati push non disponibili." }, { status: 500 });
  }

  const result = { claimed: 0, sent: 0, failed: 0, expired: 0 };
  for (const row of (data ?? []) as PushReminderCandidate[]) {
    const { data: claim, error: claimError } = await supabaseAdmin
      .from("appointment_push_deliveries")
      .insert({ appointment_id: row.appointment_id,
        subscription_id: row.subscription_id, scheduled_for: row.scheduled_for })
      .select("id").single();
    if (claimError?.code === "23505") continue;
    if (claimError || !claim) {
      console.error("customer push claim", claimError);
      result.failed++;
      continue;
    }
    result.claimed++;
    let status: "sent" | "failed" | "expired" = "sent";
    let errorMessage: string | null = null;
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(buildCustomerPushPayload(row)),
        { vapidDetails: {
          subject: "https://manager.scaramuzzo.green",
          publicKey: config.public_key, privateKey: config.private_key,
        }, TTL: 3600, timeout: 10000 },
      );
      result.sent++;
    } catch (sendError) {
      const code = (sendError as { statusCode?: number })?.statusCode;
      status = code === 404 || code === 410 ? "expired" : "failed";
      errorMessage = code ? `Push service HTTP ${code}` : "Invio push non confermato";
      result[status]++;
      if (status === "expired") {
        const { error: disableError } = await supabaseAdmin
          .from("customer_push_subscriptions").update({ enabled: false })
          .eq("id", row.subscription_id);
        if (disableError) console.error("customer push disable", disableError);
      }
    }
    const { error: updateError } = await supabaseAdmin
      .from("appointment_push_deliveries")
      .update({ status, error_message: errorMessage,
        sent_at: status === "sent" ? new Date().toISOString() : null })
      .eq("id", claim.id);
    if (updateError) console.error("customer push finalize", updateError);
  }
  return NextResponse.json({ ok: true, ...result });
}
