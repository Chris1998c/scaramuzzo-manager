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
  id: number;
  qty: number;
  discount?: number; // %
};

type CloseBody = {
  appointment_id?: number;
  payment_method: PaymentMethod;
  global_discount?: number; // %
  lines?: CloseLineInput[];
  items?: CloseLineInput[];
};

/* utils */
const toNumber = (x: unknown, fb = 0) =>
  Number.isFinite(typeof x === "number" ? x : Number(x)) ? Number(x) : fb;

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const round2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const errMsg = (e: unknown) => {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as any).message);
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown";
  }
};

function normalizeLines(body: CloseBody) {
  const raw =
    (Array.isArray(body.lines) && body.lines.length
      ? body.lines
      : Array.isArray(body.items)
      ? body.items
      : []) ?? [];

  return raw
    .map((l) => ({
      kind: l?.kind,
      id: toNumber(l?.id, NaN),
      qty: Math.floor(toNumber(l?.qty, NaN)),
      discountPct: clamp(toNumber(l?.discount ?? 0, 0), 0, 100),
    }))
    .filter(
      (l) =>
        (l.kind === "service" || l.kind === "product") &&
        Number.isFinite(l.id) &&
        l.id > 0 &&
        Number.isFinite(l.qty) &&
        l.qty > 0
    ) as Array<{ kind: LineKind; id: number; qty: number; discountPct: number }>;
}

/* handler */
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: CloseBody;
    try {
      body = (await req.json()) as CloseBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const paymentMethod = body.payment_method;
    if (paymentMethod !== "cash" && paymentMethod !== "card") {
      return NextResponse.json({ error: "payment_method invalid" }, { status: 400 });
    }

    const globalDiscountPct = clamp(toNumber(body.global_discount ?? 0, 0), 0, 100);
    const lines = normalizeLines(body);
    if (!lines.length) {
      return NextResponse.json({ error: "lines missing" }, { status: 400 });
    }

    // optional appointment link (NO agenda logic here)
    let salonId: number | null = null;
    let staffId: number | null = null;
    let customerId: string | null = null;
    let appointmentId: number | null = null;

    if (Number.isFinite(body.appointment_id)) {
      appointmentId = toNumber(body.appointment_id, NaN);
      const { data: appt, error: apptErr } = await supabaseAdmin
        .from("appointments")
        .select("id, salon_id, customer_id, staff_id, status, sale_id")
        .eq("id", appointmentId)
        .maybeSingle();

      if (apptErr || !appt) {
        return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
      }

      salonId = toNumber(appt.salon_id, NaN);
      staffId = appt.staff_id ?? null;
      customerId = appt.customer_id ?? null;
    }

    if (!Number.isFinite(salonId)) {
      return NextResponse.json({ error: "Invalid salon_id" }, { status: 400 });
    }

    // load prices
    const serviceIds = [...new Set(lines.filter(l => l.kind === "service").map(l => l.id))];
    const productIds = [...new Set(lines.filter(l => l.kind === "product").map(l => l.id))];

    const [svcRes, prodRes] = await Promise.all([
      serviceIds.length
        ? supabaseAdmin.from("services").select("id, price").in("id", serviceIds)
        : Promise.resolve({ data: [], error: null } as any),
      productIds.length
        ? supabaseAdmin.from("products").select("id, price").in("id", productIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (svcRes.error) {
      return NextResponse.json({ error: errMsg(svcRes.error) }, { status: 500 });
    }
    if (prodRes.error) {
      return NextResponse.json({ error: errMsg(prodRes.error) }, { status: 500 });
    }

    const svcMap = new Map<number, number>(
      (svcRes.data ?? []).map((s: any) => [Number(s.id), Number(s.price ?? 0)])
    );
    const prodMap = new Map<number, number>(
      (prodRes.data ?? []).map((p: any) => [Number(p.id), Number(p.price ?? 0)])
    );

    for (const l of lines) {
      if (l.kind === "service" && !svcMap.has(l.id)) {
        return NextResponse.json({ error: `Service not found ${l.id}` }, { status: 400 });
      }
      if (l.kind === "product" && !prodMap.has(l.id)) {
        return NextResponse.json({ error: `Product not found ${l.id}` }, { status: 400 });
      }
    }

    // totals
    let subtotal = 0;
    let lineDiscountTotal = 0;

    const computed = lines.map((l) => {
      const unit =
        l.kind === "service" ? svcMap.get(l.id)! : prodMap.get(l.id)!;

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

    // insert sale
    const saleInsert: any = {
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
      return NextResponse.json({ error: errMsg(saleErr) }, { status: 500 });
    }

    const saleId = Number(sale.id);

    // insert sale_items
    const saleItems = computed.map((l) => ({
      sale_id: saleId,
      service_id: l.kind === "service" ? l.id : null,
      product_id: l.kind === "product" ? l.id : null,
      staff_id: staffId,
      quantity: l.qty,
      price: l.unit_price,
      discount: l.line_discount_eur,
    }));

    const { error: itemsErr } = await supabaseAdmin
      .from("sale_items")
      .insert(saleItems);

    if (itemsErr) {
      await supabaseAdmin.from("sales").delete().eq("id", saleId);
      return NextResponse.json({ error: errMsg(itemsErr) }, { status: 500 });
    }

// ===== STOCK SCARICO DEFINITIVO =====
const productLines = computed.filter((l) => l.kind === "product");

for (const l of productLines) {
  const { error: rpcErr } = await supabaseAdmin.rpc("stock_move", {
    p_product: l.id,
    p_qty: l.qty,
    p_from_salon: salonId,
    p_to_salon: null,
    p_reason: `sale #${saleId}`,
  });

  if (rpcErr) {
    return NextResponse.json(
      { error: "Stock move failed", details: errMsg(rpcErr) },
      { status: 500 }
    );
  }
}
// ===== END STOCK =====


    // optional appointment link (NO close here)
    if (appointmentId) {
      await supabaseAdmin
        .from("appointments")
        .update({ sale_id: saleId })
        .eq("id", appointmentId);
    }

    return NextResponse.json({
      ok: true,
      sale_id: saleId,
      totals: {
        subtotal,
        global_discount_pct: globalDiscountPct,
        discount_total: discountTotal,
        total,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Errore /api/cassa/close", details: errMsg(e) },
      { status: 500 }
    );
  }
}
