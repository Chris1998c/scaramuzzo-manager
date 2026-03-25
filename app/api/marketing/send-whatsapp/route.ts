// POST /api/marketing/send-whatsapp — invio manuale massivo semplice (no code, no queue).
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  normalizePhoneForWhatsAppTo,
  sendWhatsAppTextMessage,
} from "@/lib/integrations/whatsappGraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CUSTOMERS = 50;
const MAX_MESSAGE_LEN = 4096;

type SendBody = {
  customerIds?: unknown;
  message?: unknown;
  /** Salone operativo (allineato a useActiveSalon); necessario per phone_number_id e filtro clienti. */
  salonId?: unknown;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

async function insertMarketingWhatsAppLog(params: {
  salonId: number;
  customerId: string;
  createdBy: string | null;
  messageText: string;
  status: "sent" | "error";
  providerMessageId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("marketing_whatsapp_messages").insert({
      salon_id: params.salonId,
      customer_id: params.customerId,
      created_by: params.createdBy,
      message_text: params.messageText.slice(0, MAX_MESSAGE_LEN),
      status: params.status,
      provider_message_id: params.providerMessageId ?? null,
      error_message: params.errorMessage
        ? String(params.errorMessage).slice(0, 2000)
        : null,
      sent_at: params.status === "sent" ? new Date().toISOString() : null,
    });
    if (error) console.error("[marketing/send-whatsapp] log insert", error);
  } catch (e) {
    console.error("[marketing/send-whatsapp] log insert", e);
  }
}

async function customerIdsForSalon(salonId: number): Promise<Set<string>> {
  const ids = new Set<string>();

  const [{ data: appRows, error: appErr }, { data: saleRows, error: saleErr }] =
    await Promise.all([
      supabaseAdmin
        .from("appointments")
        .select("customer_id")
        .eq("salon_id", salonId),
      supabaseAdmin.from("sales").select("customer_id").eq("salon_id", salonId),
    ]);

  if (appErr) console.error("[marketing/send-whatsapp] appointments", appErr);
  if (saleErr) console.error("[marketing/send-whatsapp] sales", saleErr);

  for (const row of appRows ?? []) {
    const id = (row as { customer_id?: string }).customer_id;
    if (id) ids.add(id);
  }
  for (const row of saleRows ?? []) {
    const id = (row as { customer_id?: string | null }).customer_id;
    if (id) ids.add(id);
  }

  return ids;
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  let access;
  try {
    access = await getUserAccess();
  } catch (e) {
    console.error("[marketing/send-whatsapp] getUserAccess", e);
    return NextResponse.json({ error: "Sessione non valida" }, { status: 401 });
  }

  if (access.role === "cliente") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }

  const salonId =
    typeof body.salonId === "number"
      ? body.salonId
      : Number(body.salonId);
  if (!Number.isFinite(salonId) || salonId <= 0) {
    return NextResponse.json({ error: "salonId richiesto" }, { status: 400 });
  }

  if (access.role === "reception") {
    const fixed = access.staffSalonId;
    if (!fixed || fixed !== salonId) {
      return NextResponse.json(
        { error: "salonId non consentito per questo utente" },
        { status: 403 },
      );
    }
  } else if (!access.allowedSalonIds.includes(salonId)) {
    return NextResponse.json(
      { error: "salonId non consentito per questo utente" },
      { status: 403 },
    );
  }

  const customerIds = [...new Set(asStringArray(body.customerIds))];
  if (!customerIds.length) {
    return NextResponse.json(
      { error: "Seleziona almeno un cliente" },
      { status: 400 },
    );
  }
  if (customerIds.length > MAX_CUSTOMERS) {
    return NextResponse.json(
      { error: `Massimo ${MAX_CUSTOMERS} destinatari per invio` },
      { status: 400 },
    );
  }

  const messageRaw = body.message != null ? String(body.message) : "";
  const message = messageRaw.trim().slice(0, MAX_MESSAGE_LEN);
  if (!message) {
    return NextResponse.json({ error: "Messaggio vuoto" }, { status: 400 });
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "WHATSAPP_ACCESS_TOKEN non configurato" },
      { status: 500 },
    );
  }

  const { data: waRow, error: waErr } = await supabaseAdmin
    .from("salon_whatsapp_settings")
    .select("phone_number_id, is_enabled")
    .eq("salon_id", salonId)
    .maybeSingle();

  if (waErr) {
    console.error("[marketing/send-whatsapp] salon_whatsapp_settings", waErr);
    return NextResponse.json(
      { error: "Errore configurazione WhatsApp salone" },
      { status: 500 },
    );
  }

  const phoneNumberId = String(
    (waRow as { phone_number_id?: string } | null)?.phone_number_id ?? "",
  ).trim();
  const enabled = !!(waRow as { is_enabled?: boolean } | null)?.is_enabled;

  if (!enabled || !phoneNumberId) {
    return NextResponse.json(
      {
        error:
          "WhatsApp non attivo o phone number ID mancante per questo salone (Impostazioni → Canali).",
      },
      { status: 400 },
    );
  }

  const allowedCustomerIds = await customerIdsForSalon(salonId);

  const { data: custRows, error: custErr } = await supabaseAdmin
    .from("customers")
    .select("id, phone")
    .in("id", customerIds);

  if (custErr) {
    console.error("[marketing/send-whatsapp] customers", custErr);
    return NextResponse.json(
      { error: "Errore lettura anagrafica clienti" },
      { status: 500 },
    );
  }

  const phoneById = new Map<string, string>();
  for (const row of custRows ?? []) {
    const r = row as { id?: string; phone?: string };
    if (r.id) phoneById.set(r.id, r.phone ?? "");
  }

  type RowResult = {
    customerId: string;
    ok: boolean;
    providerMessageId?: string | null;
    error?: string;
  };

  const results: RowResult[] = [];
  const createdBy = auth.user.id ?? null;

  for (const customerId of customerIds) {
    if (!allowedCustomerIds.has(customerId)) {
      results.push({
        customerId,
        ok: false,
        error: "Cliente non associato a questo salone",
      });
      await insertMarketingWhatsAppLog({
        salonId,
        customerId,
        createdBy,
        messageText: message,
        status: "error",
        errorMessage: "Cliente non associato a questo salone",
      });
      continue;
    }

    const phoneRaw = phoneById.get(customerId);
    if (!phoneRaw?.trim()) {
      results.push({
        customerId,
        ok: false,
        error: "Telefono mancante",
      });
      await insertMarketingWhatsAppLog({
        salonId,
        customerId,
        createdBy,
        messageText: message,
        status: "error",
        errorMessage: "Telefono mancante",
      });
      continue;
    }

    const toDigits = normalizePhoneForWhatsAppTo(phoneRaw);
    if (!toDigits) {
      results.push({
        customerId,
        ok: false,
        error: "Telefono non valido per WhatsApp",
      });
      await insertMarketingWhatsAppLog({
        salonId,
        customerId,
        createdBy,
        messageText: message,
        status: "error",
        errorMessage: "Telefono non valido per WhatsApp",
      });
      continue;
    }

    const sendRes = await sendWhatsAppTextMessage({
      accessToken: token,
      phoneNumberId,
      toDigits,
      body: message,
    });

    if (sendRes.ok) {
      results.push({
        customerId,
        ok: true,
        providerMessageId: sendRes.providerMessageId,
      });
      await insertMarketingWhatsAppLog({
        salonId,
        customerId,
        createdBy,
        messageText: message,
        status: "sent",
        providerMessageId: sendRes.providerMessageId,
      });
    } else {
      console.error(
        "[marketing/send-whatsapp] send fail",
        customerId,
        sendRes.error,
      );
      results.push({
        customerId,
        ok: false,
        error: sendRes.error,
      });
      await insertMarketingWhatsAppLog({
        salonId,
        customerId,
        createdBy,
        messageText: message,
        status: "error",
        errorMessage: sendRes.error,
      });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;

  return NextResponse.json({
    ok: true,
    salonId,
    sent,
    failed,
    results,
  });
}
