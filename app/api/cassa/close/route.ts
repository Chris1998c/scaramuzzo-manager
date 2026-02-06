// app/api/cassa/close/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentMethod = "cash" | "card";
type LineKind = "service" | "product";

type CloseLineInput = {
  kind: LineKind;
  id: number;         // service_id or product_id
  qty: number;
  discount?: number;  // % (0-100)
};

type CloseBody = {
  appointment_id: number;
  payment_method: PaymentMethod;
  global_discount?: number; // % (0-100)
  lines?: CloseLineInput[];
  items?: CloseLineInput[]; // compat
};

/* ---------------- utils ---------------- */

function errMsg(e: unknown): string {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as any).message);
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown";
  }
}

function toNumber(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function normalizeLines(body: CloseBody): Array<{ kind: LineKind; id: number; qty: number; discountPct: number }> {
  const raw =
    (Array.isArray(body.lines) && body.lines.length
      ? body.lines
      : Array.isArray(body.items)
        ? body.items
        : []) ?? [];

  if (!Array.isArray(raw)) return [];

  return raw
    .map((l) => ({
      kind: l?.kind,
      id: toNumber(l?.id, NaN),
      qty: toNumber(l?.qty, NaN),
      discountPct: toNumber(l?.discount ?? 0, 0),
    }))
    .filter(
      (l) =>
        (l.kind === "service" || l.kind === "product") &&
        Number.isFinite(l.id) &&
        l.id > 0 &&
        Number.isFinite(l.qty) &&
        l.qty > 0
    )
    .map((l) => ({
      kind: l.kind as LineKind,
      id: l.id,
      qty: Math.floor(l.qty),
      discountPct: clamp(l.discountPct, 0, 100),
    }));
}

/* ---------------- handler ---------------- */

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();

    // AUTH (solo check login)
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // BODY
    let body: CloseBody;
    try {
      body = (await req.json()) as CloseBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const appointmentId = toNumber(body.appointment_id, NaN);
    const paymentMethod = body.payment_method;
    const globalDiscountPct = clamp(toNumber(body.global_discount ?? 0, 0), 0, 100);
    const lines = normalizeLines(body);

    if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
      return NextResponse.json({ error: "appointment_id invalid" }, { status: 400 });
    }
    if (paymentMethod !== "cash" && paymentMethod !== "card") {
      return NextResponse.json({ error: "payment_method invalid" }, { status: 400 });
    }
    if (!lines.length) {
      return NextResponse.json({ error: "lines missing" }, { status: 400 });
    }

    // LOAD APPOINTMENT (ADMIN)
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, salon_id, customer_id, staff_id, status, sale_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptErr || !appt) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    // already closed
    if (appt.status === "done" && appt.sale_id) {
      return NextResponse.json(
        { ok: true, sale_id: appt.sale_id, already_closed: true },
        { status: 200 }
      );
    }

    const salonId = toNumber(appt.salon_id, NaN);
    if (!Number.isFinite(salonId)) {
      return NextResponse.json({ error: "Invalid salon_id" }, { status: 400 });
    }

    const staffId = appt.staff_id ?? null;
    const customerId = appt.customer_id ?? null;

    // LOAD PRICES (ADMIN)
    const serviceIds = [...new Set(lines.filter((l) => l.kind === "service").map((l) => l.id))];
    const productIds = [...new Set(lines.filter((l) => l.kind === "product").map((l) => l.id))];

    const [svcRes, prodRes] = await Promise.all([
      serviceIds.length
        ? supabaseAdmin.from("services").select("id, price").in("id", serviceIds)
        : Promise.resolve({ data: [], error: null } as any),
      productIds.length
        ? supabaseAdmin.from("products").select("id, price").in("id", productIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (svcRes.error) {
      return NextResponse.json({ error: `Load services failed: ${errMsg(svcRes.error)}` }, { status: 500 });
    }
    if (prodRes.error) {
      return NextResponse.json({ error: `Load products failed: ${errMsg(prodRes.error)}` }, { status: 500 });
    }

    const svcMap = new Map<number, number>(
      (svcRes.data ?? []).map((s: any) => [Number(s.id), Number(s.price ?? 0)])
    );
    const prodMap = new Map<number, number>(
      (prodRes.data ?? []).map((p: any) => [Number(p.id), Number(p.price ?? 0)])
    );

    for (const l of lines) {
      if (l.kind === "service" && !svcMap.has(l.id)) {
        return NextResponse.json({ error: `Service not found: ${l.id}` }, { status: 400 });
      }
      if (l.kind === "product" && !prodMap.has(l.id)) {
        return NextResponse.json({ error: `Product not found: ${l.id}` }, { status: 400 });
      }
    }

    // COMPUTE TOTALS
    let subtotal = 0;           // net after line discounts
    let lineDiscountTotal = 0;  // € discounts on lines

    const computed = lines.map((l) => {
      const unit = l.kind === "service" ? (svcMap.get(l.id) as number) : (prodMap.get(l.id) as number);

      const gross = round2(unit * l.qty);
      const lineDisc = round2(gross * (l.discountPct / 100));
      const net = round2(gross - lineDisc);

      subtotal = round2(subtotal + net);
      lineDiscountTotal = round2(lineDiscountTotal + lineDisc);

      return {
        ...l,
        unit_price: round2(unit),
        line_discount_eur: lineDisc,
        line_total: net,
      };
    });

    const globalDiscountAmount = round2(subtotal * (globalDiscountPct / 100));
    const total = round2(subtotal - globalDiscountAmount);
    const discountTotal = round2(lineDiscountTotal + globalDiscountAmount);

    // INSERT SALE (schema REALE)
    // sales: salon_id, customer_id?, total_amount, payment_method, discount, date
    const saleInsert: Record<string, any> = {
      salon_id: salonId,
      total_amount: total,
      payment_method: paymentMethod,
      discount: discountTotal,
      date: new Date().toISOString(),
    };
    if (customerId) saleInsert.customer_id = customerId;

    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .insert(saleInsert)
      .select("id")
      .single();

    if (saleErr || !sale) {
      return NextResponse.json(
        { error: "Sale insert failed", details: saleErr ? errMsg(saleErr) : "unknown", saleInsert },
        { status: 500 }
      );
    }

    const saleId = Number(sale.id);
    if (!Number.isFinite(saleId)) {
      return NextResponse.json({ error: "Sale insert failed: invalid id" }, { status: 500 });
    }

    // INSERT SALE_ITEMS (schema REALE)
    // sale_items: sale_id, service_id?, product_id?, staff_id?, quantity, price (unit), discount (€)
    const saleItems = computed.map((l) => ({
      sale_id: saleId,
      service_id: l.kind === "service" ? l.id : null,
      product_id: l.kind === "product" ? l.id : null,
      staff_id: staffId,
      quantity: l.qty,
      price: l.unit_price,
      discount: l.line_discount_eur,
    }));

    const { error: itemsErr } = await supabaseAdmin.from("sale_items").insert(saleItems);

    if (itemsErr) {
      await supabaseAdmin.from("sales").delete().eq("id", saleId);
      return NextResponse.json(
        { error: "Sale items insert failed", details: errMsg(itemsErr) },
        { status: 500 }
      );
    }

    // CLOSE APPOINTMENT (set status + sale_id)
    const { error: closeErr } = await supabaseAdmin
      .from("appointments")
      .update({ status: "done", sale_id: saleId })
      .eq("id", appointmentId);

    if (closeErr) {
      await supabaseAdmin.from("sales").delete().eq("id", saleId);
      return NextResponse.json(
        { error: "Appointment close failed", details: errMsg(closeErr) },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        sale_id: saleId,
        appointment_id: appointmentId,
        totals: {
          subtotal,
          global_discount_pct: globalDiscountPct,
          discount_total: discountTotal,
          total,
        },
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: "Errore /api/cassa/close", details: errMsg(e) },
      { status: 500 }
    );
  }
}
