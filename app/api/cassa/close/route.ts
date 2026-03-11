// app/api/cassa/close/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentMethod = "cash" | "card";
type LineKind = "service" | "product";
type StaffRole = "reception" | "coordinator" | "magazzino";

type CloseLineInput = {
  kind: LineKind;
  id: number;
  qty: number;
  discount?: number; // % (0-100) per riga
};

type CloseBody = {
  appointment_id?: number;
  salon_id?: number; // vendita senza appuntamento
  payment_method: PaymentMethod;
  global_discount?: number; // % (0-100) sul subtotale già scontato per riga
  lines?: CloseLineInput[];
  items?: CloseLineInput[]; // compat
};

/* =======================
   Utils
======================= */

const toNumber = (x: unknown, fb = 0) => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? Number(n) : fb;
};

const toInt = (x: unknown, fb = NaN) => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const round2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const errMsg = (e: unknown) => {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) {
    return String((e as { message?: unknown }).message);
  }
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown";
  }
};

function roleFromMetadata(user: unknown): string {
  const u = user as {
    user_metadata?: { role?: unknown };
    app_metadata?: { role?: unknown };
  };

  return String(
    u?.user_metadata?.role ?? u?.app_metadata?.role ?? ""
  ).trim();
}

async function getRoleFromDb(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, roles:roles(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const roleName = (data as { roles?: { name?: unknown } })?.roles?.name;
  return roleName ? String(roleName).trim() : null;
}

async function getReceptionSalonId(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("salon_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const sid = toInt((data as { salon_id?: unknown })?.salon_id, NaN);
  return Number.isFinite(sid) && sid > 0 ? sid : null;
}

function normalizeLines(body: CloseBody) {
  const raw =
    (Array.isArray(body.lines) && body.lines.length
      ? body.lines
      : Array.isArray(body.items) && body.items.length
        ? body.items
        : []) ?? [];

  return raw
    .map((l) => ({
      kind: l?.kind,
      id: toInt(l?.id, NaN),
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
    ) as Array<{
    kind: LineKind;
    id: number;
    qty: number;
    discountPct: number;
  }>;
}

/* =======================
   Handler
======================= */

export async function POST(req: Request) {
  let createdSaleId: number | null = null;

  try {
    const supabase = await createServerSupabase();

    // 1) AUTH
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const user = authData.user;
    const userId = user.id;

    // ruolo: DB come source of truth, fallback metadata
    const dbRole = await getRoleFromDb(userId);
    const role = (dbRole || roleFromMetadata(user)) as StaffRole;

    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // 2) BODY
    let body: CloseBody;
    try {
      body = (await req.json()) as CloseBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const paymentMethod = body.payment_method;
    if (paymentMethod !== "cash" && paymentMethod !== "card") {
      return NextResponse.json(
        { error: "Metodo di pagamento non valido" },
        { status: 400 }
      );
    }

    const lines = normalizeLines(body);
    if (!lines.length) {
      return NextResponse.json(
        { error: "Nessun servizio o prodotto selezionato" },
        { status: 400 }
      );
    }

    const globalDiscountPct = clamp(
      toNumber(body.global_discount ?? 0, 0),
      0,
      100
    );

    // 3) DETERMINO SALONE / STAFF / CUSTOMER
    let salonId: number | null = null;
    let staffId: number | null = null;
    let customerId: string | null = null;
    let appointmentId: number | null = null;

    const hasAppointmentId = Number.isFinite(toNumber(body.appointment_id, NaN));

    if (hasAppointmentId) {
      appointmentId = toInt(body.appointment_id, NaN);

      const { data: appt, error: apptErr } = await supabaseAdmin
        .from("appointments")
        .select("id, salon_id, customer_id, staff_id, status, sale_id")
        .eq("id", appointmentId)
        .maybeSingle();

      if (apptErr || !appt) {
        return NextResponse.json(
          { error: "Appuntamento non trovato" },
          { status: 404 }
        );
      }

      // blocca doppia chiusura / doppia vendita
      if ((appt as { sale_id?: unknown }).sale_id != null) {
        return NextResponse.json(
          { error: "Appuntamento già chiuso in cassa" },
          { status: 400 }
        );
      }

      const apptStatus = String((appt as { status?: unknown }).status ?? "");

      if (apptStatus === "cancelled") {
        return NextResponse.json(
          { error: "Impossibile chiudere in cassa un appuntamento cancellato" },
          { status: 400 }
        );
      }

      if (apptStatus === "done") {
        return NextResponse.json(
          { error: "Appuntamento già chiuso" },
          { status: 400 }
        );
      }

      salonId = toInt((appt as { salon_id?: unknown }).salon_id, NaN);
      staffId = ((appt as { staff_id?: unknown }).staff_id as number | null) ?? null;
      customerId =
        ((appt as { customer_id?: unknown }).customer_id as string | null) ?? null;
    } else {
      salonId = Number.isFinite(toNumber(body.salon_id, NaN))
        ? toInt(body.salon_id, NaN)
        : null;
    }

    if (!salonId || !Number.isFinite(salonId) || salonId <= 0) {
      return NextResponse.json(
        { error: "salon_id mancante/invalid" },
        { status: 400 }
      );
    }

    // 4) AUTHZ SALONE
    if (role === "reception") {
      const mySalonId = await getReceptionSalonId(userId);

      if (!mySalonId) {
        return NextResponse.json(
          { error: "Reception senza staff.salon_id associato" },
          { status: 403 }
        );
      }

      if (salonId !== mySalonId) {
        return NextResponse.json(
          { error: "salon_id non consentito per questo utente" },
          { status: 403 }
        );
      }
    }

    // 5) CASSA APERTA
    const { data: activeSession, error: sessionErr } = await supabaseAdmin
      .from("cash_sessions")
      .select("id, session_date, opened_at")
      .eq("salon_id", salonId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionErr) {
      return NextResponse.json(
        { error: "Errore controllo sessione cassa" },
        { status: 500 }
      );
    }

    if (!activeSession) {
      return NextResponse.json(
        { error: "Cassa chiusa. Aprire la cassa prima di procedere." },
        { status: 400 }
      );
    }

    // 6) PREZZI SERVER-SIDE
    const serviceIds = [
      ...new Set(lines.filter((l) => l.kind === "service").map((l) => l.id)),
    ];
    const productIds = [
      ...new Set(lines.filter((l) => l.kind === "product").map((l) => l.id)),
    ];

    const [svcRes, prodRes] = await Promise.all([
      serviceIds.length
        ? supabaseAdmin.from("services").select("id, price").in("id", serviceIds)
        : Promise.resolve({ data: [], error: null } as const),
      productIds.length
        ? supabaseAdmin.from("products").select("id, price").in("id", productIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);

    if (svcRes.error || prodRes.error) {
      return NextResponse.json(
        { error: "Errore nel caricamento prezzi" },
        { status: 500 }
      );
    }

    const svcMap = new Map<number, number>(
      (svcRes.data ?? []).map((s) => [s.id, Number(s.price)])
    );
    const prodMap = new Map<number, number>(
      (prodRes.data ?? []).map((p) => [p.id, Number(p.price)])
    );

    // 7) TOTALI
    let subtotal = 0;
    let totalDiscount = 0;

    const computedItems = lines.map((l) => {
      const rawUnit =
        l.kind === "service" ? svcMap.get(l.id) : prodMap.get(l.id);
      const unitPrice = toNumber(rawUnit, NaN);

      if (!Number.isFinite(unitPrice)) {
        throw new Error(`${l.kind} ID ${l.id} senza prezzo valido`);
      }

      const gross = round2(unitPrice * l.qty);
      const lineDisc = round2(gross * (l.discountPct / 100));
      const net = round2(gross - lineDisc);

      subtotal = round2(subtotal + net);
      totalDiscount = round2(totalDiscount + lineDisc);

      return {
        ...l,
        unitPrice,
        lineDisc,
        net,
      };
    });

    const globalDiscountAmount = round2(subtotal * (globalDiscountPct / 100));
    const finalTotal = round2(Math.max(0, subtotal - globalDiscountAmount));
    totalDiscount = round2(totalDiscount + globalDiscountAmount);

    // 8) CREA VENDITA
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

    if (saleErr || !sale) {
      return NextResponse.json(
        { error: saleErr?.message ?? "Errore creazione vendita" },
        { status: 500 }
      );
    }

    const saleId = (sale as { id: number }).id;
    createdSaleId = saleId;

    const saleItemsInsert = computedItems.map((l) => ({
      sale_id: saleId,
      service_id: l.kind === "service" ? l.id : null,
      product_id: l.kind === "product" ? l.id : null,
      staff_id: staffId,
      quantity: l.qty,
      price: l.unitPrice,
      discount: l.lineDisc,
    }));

    const { error: itemsErr } = await supabaseAdmin
      .from("sale_items")
      .insert(saleItemsInsert);

    if (itemsErr) {
      await supabaseAdmin.from("sales").delete().eq("id", saleId);
      return NextResponse.json(
        { error: itemsErr.message ?? "Errore inserimento articoli" },
        { status: 500 }
      );
    }

    // 9) SCARICO MAGAZZINO
    for (const l of computedItems.filter((i) => i.kind === "product")) {
      const { error: rpcErr } = await supabaseAdmin.rpc("stock_move", {
        p_product_id: l.id,
        p_qty: l.qty,
        p_from_salon: salonId,
        p_to_salon: null,
        p_movement_type: "sale",
        p_reason: `Vendita #${saleId}`,
      });

      if (rpcErr) {
        await supabaseAdmin.from("sale_items").delete().eq("sale_id", saleId);
        await supabaseAdmin.from("sales").delete().eq("id", saleId);

        return NextResponse.json(
          {
            error: `Errore scarico magazzino prodotto ${l.id}: ${rpcErr.message ?? "rpc"}`,
          },
          { status: 500 }
        );
      }
    }

    // 10) CHIUDE APPUNTAMENTO
    if (appointmentId) {
      const { error: apptUpdateErr } = await supabaseAdmin
        .from("appointments")
        .update({
          sale_id: saleId,
          status: "done",
        })
        .eq("id", appointmentId)
        .is("sale_id", null);

      if (apptUpdateErr) {
        return NextResponse.json(
          {
            ok: true,
            sale_id: saleId,
            totals: { subtotal, total: finalTotal, discount: totalDiscount },
            warning: `Vendita ok, ma aggiornamento appuntamento fallito: ${apptUpdateErr.message}`,
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      sale_id: saleId,
      totals: { subtotal, total: finalTotal, discount: totalDiscount },
    });
  } catch (e) {
    try {
      if (createdSaleId) {
        await supabaseAdmin.from("sale_items").delete().eq("sale_id", createdSaleId);
        await supabaseAdmin.from("sales").delete().eq("id", createdSaleId);
      }
    } catch {
      // ignore cleanup error
    }

    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}