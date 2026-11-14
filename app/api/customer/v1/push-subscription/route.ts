import { NextResponse } from "next/server";
import { requireCustomerContext } from "@/app/api/customer/v1/_lib/requireCustomerContext";
import { customerContextErrorResponse } from "@/lib/customer-app/customerApiResponse";
import { loadCustomerPushConfig } from "@/lib/customer-app/customerPushConfig";
import { parseCustomerPushSubscription } from "@/lib/customer-app/customerPushSubscription";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(e: unknown) {
  const auth = customerContextErrorResponse(e);
  if (auth) return auth;
  console.error("customer push subscription", e);
  return NextResponse.json({ error: "Impossibile gestire i promemoria." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    await requireCustomerContext(req);
    const config = await loadCustomerPushConfig();
    if (!config.public_key || !config.private_key) {
      return NextResponse.json({ error: "Promemoria push non configurati." }, { status: 503 });
    }
    return NextResponse.json({ publicKey: config.public_key });
  } catch (e) { return errorResponse(e); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCustomerContext(req);
    const subscription = parseCustomerPushSubscription(await req.json().catch(() => null));
    if (!subscription) {
      return NextResponse.json({ error: "Sottoscrizione push non valida." }, { status: 400 });
    }
    const config = await loadCustomerPushConfig();
    if (!config.public_key || !config.private_key) {
      return NextResponse.json({ error: "Promemoria push non configurati." }, { status: 503 });
    }
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("customer_push_subscriptions")
      .select("id, user_id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing && existing.user_id !== ctx.authUserId) {
      return NextResponse.json({ error: "Questo dispositivo è collegato a un altro account." }, { status: 409 });
    }
    if (!existing) {
      const { count, error: countError } = await supabaseAdmin
        .from("customer_push_subscriptions")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", ctx.authUserId).eq("enabled", true);
      if (countError) throw countError;
      if ((count ?? 0) >= 5) {
        return NextResponse.json({ error: "Limite di cinque dispositivi raggiunto." }, { status: 409 });
      }
    }
    const row = {
      user_id: ctx.authUserId, customer_id: ctx.customerId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh, auth: subscription.keys.auth,
      enabled: true, updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await supabaseAdmin.from("customer_push_subscriptions").update(row).eq("id", existing.id)
      : await supabaseAdmin.from("customer_push_subscriptions").insert(row);
    if (error) throw error;
    return NextResponse.json({ enabled: true });
  } catch (e) { return errorResponse(e); }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireCustomerContext(req);
    const body = await req.json().catch(() => null);
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    if (!endpoint || endpoint.length > 2048) {
      return NextResponse.json({ error: "Endpoint mancante." }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from("customer_push_subscriptions")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", ctx.authUserId).eq("endpoint", endpoint);
    if (error) throw error;
    return NextResponse.json({ enabled: false });
  } catch (e) { return errorResponse(e); }
}
