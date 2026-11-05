// GET/POST /api/webhooks/whatsapp — Meta WhatsApp Cloud API webhook (esiti consegna).
// Fuori dal matcher di middleware.ts (nessuna sessione richiesta).
// Autenticazione POST: sola firma X-Hub-Signature-256 + WHATSAPP_APP_SECRET.
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  applyWhatsAppDeliveryStatus,
} from "@/lib/integrations/appointmentReminderProcessor";
import { parseWhatsAppStatusEvents } from "@/lib/whatsapp/whatsappDeliveryStatus";
import {
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
} from "@/lib/whatsapp/whatsappWebhookSignature";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";
  const result = verifyWhatsAppWebhookChallenge({
    mode: url.searchParams.get("hub.mode"),
    verifyToken: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    expectedVerifyToken: expected,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return new NextResponse(result.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() ?? "";
  if (!appSecret) {
    return NextResponse.json(
      { error: "WHATSAPP_APP_SECRET non configurato" },
      { status: 503 },
    );
  }

  const rawBuf = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256");

  if (
    !verifyWhatsAppWebhookSignature({
      rawBody: rawBuf,
      signatureHeader: signature,
      appSecret,
    })
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBuf.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = parseWhatsAppStatusEvents(payload);
  let applied = 0;
  let duplicates = 0;
  let stale = 0;
  let unknown = 0;

  for (const event of events) {
    const r = await applyWhatsAppDeliveryStatus(supabaseAdmin, event);
    if (r.applied) applied += 1;
    else if (r.reason === "duplicate_event") duplicates += 1;
    else if (r.reason === "stale_status") stale += 1;
    else if (r.reason === "unknown_message") unknown += 1;
  }

  // Meta richiede 200 rapido; dettagli solo in log.
  console.info("[whatsapp-webhook] processed", {
    events: events.length,
    applied,
    duplicates,
    stale,
    unknown,
  });

  return NextResponse.json({ ok: true });
}
