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

    // 1. AUTH CHECK
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

    // 2. VALIDAZIONE INPUT
    const paymentMethod = body.payment_method;
    if (paymentMethod !== "cash" && paymentMethod !== "card") {
      return NextResponse.json({ error: "Metodo di pagamento non valido" }, { status: 400 });
    }

    const lines = normalizeLines(body);
    if (!lines.length) {
      return NextResponse.json({ error: "Nessun servizio o prodotto selezionato" }, { status: 400 });
    }

    // 3. RECUPERO DATI APPUNTAMENTO / SALONE
    let salonId: number | null = null;
    let staffId: number | null = null;
    let customerId: string | null = null;
    let appointmentId: number | null = null;

    if (Number.isFinite(body.appointment_id)) {
      appointmentId = toNumber(body.appointment_id, NaN);
      const { data: appt, error: apptErr } = await supabaseAdmin
        .from("appointments")
        .select("id, salon_id, customer_id, staff_id, status")
        .eq("id", appointmentId)
        .maybeSingle();

      if (apptErr || !appt) {
        return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });
      }

      salonId = toNumber(appt.salon_id, NaN);
      staffId = appt.staff_id ?? null;
      customerId = appt.customer_id ?? null;
    }

    if (!Number.isFinite(salonId)) {
      return NextResponse.json({ error: "ID Salone non valido o mancante" }, { status: 400 });
    }

    // 4. CONTROLLO SESSIONE CASSA APERTA (Consigliato)
    const { data: activeSession } = await supabaseAdmin
      .from("cash_sessions")
      .select("id")
      .eq("salon_id", salonId)
      .is("closed_at", null)
      .maybeSingle();

    if (!activeSession) {
        return NextResponse.json({ error: "Cassa chiusa. Aprire la cassa prima di procedere." }, { status: 400 });
    }

    // 5. CARICAMENTO LISTINI (PREZZI REALI LATO SERVER)
    const serviceIds = [...new Set(lines.filter(l => l.kind === "service").map(l => l.id))];
    const productIds = [...new Set(lines.filter(l => l.kind === "product").map(l => l.id))];

    const [svcRes, prodRes] = await Promise.all([
      serviceIds.length
        ? supabaseAdmin.from("services").select("id, price").in("id", serviceIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? supabaseAdmin.from("products").select("id, price").in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (svcRes.error || prodRes.error) {
      return NextResponse.json({ error: "Errore nel caricamento prezzi" }, { status: 500 });
    }

    const svcMap = new Map(svcRes.data?.map((s) => [s.id, s.price]));
    const prodMap = new Map(prodRes.data?.map((p) => [p.id, p.price]));

    // 6. CALCOLO TOTALI
    const globalDiscountPct = clamp(toNumber(body.global_discount ?? 0, 0), 0, 100);
    let subtotal = 0;
    let totalDiscount = 0;

    const computedItems = lines.map((l) => {
      const unitPrice = l.kind === "service" ? svcMap.get(l.id) : prodMap.get(l.id);
      if (unitPrice === undefined) throw new Error(`${l.kind} ID ${l.id} non trovato`);

      const gross = round2(unitPrice * l.qty);
      const lineDisc = round2(gross * (l.discountPct / 100));
      const net = round2(gross - lineDisc);

      subtotal = round2(subtotal + net);
      totalDiscount = round2(totalDiscount + lineDisc);

      return { ...l, unitPrice, lineDisc, net };
    });

    const globalDiscountAmount = round2(subtotal * (globalDiscountPct / 100));
    const finalTotal = round2(subtotal - globalDiscountAmount);
    totalDiscount = round2(totalDiscount + globalDiscountAmount);

    // 7. ESECUZIONE TRANSAZIONE (INSERIMENTO VENDITA)
    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .insert({
        salon_id: salonId,
        customer_id: customerId,
        total_amount: finalTotal,
        payment_method: paymentMethod,
        discount: totalDiscount,
        date: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (saleErr || !sale) return NextResponse.json({ error: "Errore creazione vendita" }, { status: 500 });
    const saleId = sale.id;

    // 8. INSERIMENTO DETTAGLI VENDITA
    const saleItemsInsert = computedItems.map((l) => ({
      sale_id: saleId,
      service_id: l.kind === "service" ? l.id : null,
      product_id: l.kind === "product" ? l.id : null,
      staff_id: staffId,
      quantity: l.qty,
      price: l.unitPrice,
      discount: l.lineDisc,
    }));

    const { error: itemsErr } = await supabaseAdmin.from("sale_items").insert(saleItemsInsert);
    if (itemsErr) {
      await supabaseAdmin.from("sales").delete().eq("id", saleId); // Rollback manuale
      return NextResponse.json({ error: "Errore inserimento articoli" }, { status: 500 });
    }

    // 9. SCARICO MAGAZZINO (RPC)
    for (const l of computedItems.filter(i => i.kind === "product")) {
      const { error: rpcErr } = await supabaseAdmin.rpc("stock_move", {
        p_product: l.id,
        p_qty: l.qty,
        p_from_salon: salonId,
        p_to_salon: null,
        p_reason: `Vendita #${saleId}`,
      });
      if (rpcErr) console.error("Errore magazzino per prodotto", l.id, rpcErr);
    }

    // 10. CHIUSURA DEFINITIVA APPUNTAMENTO (Agenda)
    if (appointmentId) {
      await supabaseAdmin
        .from("appointments")
        .update({ 
            sale_id: saleId,
            status: "done" // Chiude l'appuntamento in agenda
        })
        .eq("id", appointmentId);
    }

    return NextResponse.json({
      ok: true,
      sale_id: saleId,
      totals: { subtotal, total: finalTotal, discount: totalDiscount }
    });

  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}