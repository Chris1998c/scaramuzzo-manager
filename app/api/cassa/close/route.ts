// app/api/cassa/close/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPrintBridgeReachable } from "@/lib/printBridgeHealth";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentMethod = "cash" | "card";
type LineKind = "service" | "product";

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
  idempotency_key?: string;
  lines?: CloseLineInput[];
  items?: CloseLineInput[]; // compat
  /** Ignorato dal server: la stampa fiscale segue `cash_sessions.printer_enabled` della sessione aperta. */
  printer_enabled?: boolean;
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

type FiscalProfileForJob = {
  printer_model?: string;
  printer_serial?: string;
  legal_name?: string;
  vat_number?: string;
};

async function getOrCreateSaleReceiptPrintJob(args: {
  salonId: number;
  userId: string;
  saleId: number;
  fiscal: FiscalProfileForJob;
  finalTotal: number;
  paymentMethod: PaymentMethod;
}): Promise<
  | { ok: true; jobId: number; createdThisRequest: boolean }
  | { ok: false; error: string }
> {
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("fiscal_print_jobs")
    .select("id")
    .eq("kind", "sale_receipt")
    .eq("sale_id", args.saleId)
    .maybeSingle();

  if (selErr) {
    return { ok: false, error: selErr.message ?? "lookup fiscal job" };
  }
  if (existing?.id != null) {
    return { ok: true, jobId: Number(existing.id), createdThisRequest: false };
  }

  const fiscal = args.fiscal;
  const { data: ins, error: insErr } = await supabaseAdmin
    .from("fiscal_print_jobs")
    .insert({
      salon_id: args.salonId,
      created_by: args.userId,
      kind: "sale_receipt",
      sale_id: args.saleId,
      printer_model: fiscal.printer_model,
      printer_serial: fiscal.printer_serial,
      payload: {
        sale_id: args.saleId,
        total_amount: args.finalTotal,
        payment_method: args.paymentMethod,
        legal_name: fiscal.legal_name,
        vat_number: fiscal.vat_number,
        printer_serial: fiscal.printer_serial,
        requested_at: new Date().toISOString(),
      },
      status: "pending",
    })
    .select("id")
    .single();

  if (!insErr && ins?.id != null) {
    return { ok: true, jobId: Number(ins.id), createdThisRequest: true };
  }

  const dup =
    insErr?.code === "23505" ||
    /duplicate key|unique constraint/i.test(String(insErr?.message ?? ""));

  if (dup) {
    const { data: again, error: againErr } = await supabaseAdmin
      .from("fiscal_print_jobs")
      .select("id")
      .eq("kind", "sale_receipt")
      .eq("sale_id", args.saleId)
      .maybeSingle();
    if (againErr) {
      return { ok: false, error: againErr.message ?? "conflict refetch job" };
    }
    if (again?.id != null) {
      return { ok: true, jobId: Number(again.id), createdThisRequest: false };
    }
  }

  return { ok: false, error: insErr?.message ?? "insert fiscal job failed" };
}

async function ensureFiscalJobAndMaybeQueueSale(args: {
  saleId: number;
  salonId: number;
  userId: string;
  fiscal: FiscalProfileForJob;
  finalTotal: number;
  paymentMethod: PaymentMethod;
}): Promise<
  | { ok: true; fiscalPrintJobId: number }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    }
> {
  const jobRes = await getOrCreateSaleReceiptPrintJob({
    salonId: args.salonId,
    userId: args.userId,
    saleId: args.saleId,
    fiscal: args.fiscal,
    finalTotal: args.finalTotal,
    paymentMethod: args.paymentMethod,
  });

  if (!jobRes.ok) {
    return {
      ok: false,
      status: 500,
      body: {
        error: `Impossibile accodare la stampa fiscale: ${jobRes.error}. La vendita è stata registrata.`,
      },
    };
  }

  const { jobId: fiscalPrintJobId, createdThisRequest } = jobRes;

  const { data: saleAfterQueued, error: fsErr } = await supabaseAdmin
    .from("sales")
    .update({ fiscal_status: "queued" })
    .eq("id", args.saleId)
    .eq("fiscal_status", "pending")
    .select("id");

  if (fsErr) {
    const detail = fsErr.message ?? "errore sconosciuto";
    console.error("[cassa/close] sales fiscal_status -> queued failed", fsErr);

    if (createdThisRequest) {
      const { error: delErr } = await supabaseAdmin
        .from("fiscal_print_jobs")
        .delete()
        .eq("id", fiscalPrintJobId);
      if (delErr) {
        console.error("[cassa/close] rollback fiscal_print_jobs failed", delErr);
      }
    }

    return {
      ok: false,
      status: 500,
      body: {
        error: `Vendita registrata ma allineamento stampa fiscale fallito (${detail}). Il job è stato annullato per evitare incoerenze con il callback; fiscal_status resta pending.`,
        sale_id: args.saleId,
        fiscal_job_cancelled: createdThisRequest ? fiscalPrintJobId : null,
      },
    };
  }

  if (Array.isArray(saleAfterQueued) && saleAfterQueued.length === 0) {
    console.info("[cassa/close] sales fiscal_status already finalized before queued update", {
      sale_id: args.saleId,
    });
  }

  return { ok: true, fiscalPrintJobId };
}

/* =======================
   Handler
======================= */

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();

    // 1) AUTH
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const userId = authData.user.id;
    const access = await getUserAccess();
    const role = access.role;

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

    const hasAppointmentId = Number.isFinite(toNumber(body.appointment_id, NaN));
    const hasSalonIdInBody = Number.isFinite(toNumber(body.salon_id, NaN));

    // richiedi almeno appointment_id o salon_id
    if (!hasAppointmentId && !hasSalonIdInBody) {
      return NextResponse.json(
        { error: "Devi specificare appointment_id o salon_id" },
        { status: 400 }
      );
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

    const MAX_LINES = 100;
    const MAX_QTY_PER_LINE = 50;

    if (lines.length > MAX_LINES) {
      return NextResponse.json(
        { error: `Troppe righe in cassa (max ${MAX_LINES})` },
        { status: 400 }
      );
    }

    if (lines.some((l) => l.qty > MAX_QTY_PER_LINE)) {
      return NextResponse.json(
        { error: `Quantità per riga troppo alta (max ${MAX_QTY_PER_LINE})` },
        { status: 400 }
      );
    }

    const globalDiscountPct = clamp(
      toNumber(body.global_discount ?? 0, 0),
      0,
      100
    );
    const headerIdempotencyKey = req.headers.get("idempotency-key");
    const rawIdempotencyKey =
      typeof body.idempotency_key === "string"
        ? body.idempotency_key
        : headerIdempotencyKey;
    const idempotencyKey = rawIdempotencyKey?.trim()
      ? rawIdempotencyKey.trim()
      : null;

    // 3) DETERMINO SALONE / STAFF / CUSTOMER
    let salonId: number | null = null;
    let staffId: number | null = null;
    let customerId: string | null = null;
    let appointmentId: number | null = null;

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
          {
            error: "Appuntamento già chiuso in cassa",
            already_closed: true,
            sale_id: (appt as { sale_id?: unknown }).sale_id ?? null,
          },
          { status: 409 }
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

      if (apptStatus !== "in_sala") {
        return NextResponse.json(
          { error: "Appuntamento non in sala: chiusura cassa non consentita" },
          { status: 400 }
        );
      }

      const requestedSalonId = hasSalonIdInBody
        ? toInt(body.salon_id, NaN)
        : null;

      salonId = toInt((appt as { salon_id?: unknown }).salon_id, NaN);
      staffId = ((appt as { staff_id?: unknown }).staff_id as number | null) ?? null;
      customerId =
        ((appt as { customer_id?: unknown }).customer_id as string | null) ?? null;

      if (requestedSalonId && salonId && requestedSalonId !== salonId) {
        return NextResponse.json(
          { error: "salon_id non coerente con l'appuntamento" },
          { status: 400 }
        );
      }
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
      const mySalonId = access.staffSalonId;

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
    } else {
      if (!access.allowedSalonIds.includes(salonId)) {
        return NextResponse.json(
          { error: "salon_id non consentito per questo utente" },
          { status: 403 }
        );
      }
    }

    // 5) CASSA APERTA
    const { data: activeSession, error: sessionErr } = await supabaseAdmin
      .from("cash_sessions")
      .select("id, session_date, opened_at, printer_enabled")
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

    const printerEnabled = Boolean(
      (activeSession as { printer_enabled?: unknown }).printer_enabled
    );

    let fiscalProfileForJob: FiscalProfileForJob | null = null;

    if (printerEnabled) {
      const bridge = await checkPrintBridgeReachable();
      if (!bridge.ok) {
        return NextResponse.json({ error: bridge.error }, { status: 400 });
      }
      const { data: profile, error: profErr } = await supabaseAdmin.rpc(
        "get_fiscal_profile",
        {
          p_salon_id: salonId,
          p_on_date: new Date().toISOString().slice(0, 10),
        }
      );
      if (profErr || !profile?.length) {
        return NextResponse.json(
          {
            error:
              "Profilo fiscale non trovato per questo salone. Impossibile stampare.",
          },
          { status: 400 }
        );
      }
      fiscalProfileForJob = profile[0] as FiscalProfileForJob;
    }

    // 6) PREZZI SERVER-SIDE
    const serviceIds = [
      ...new Set(lines.filter((l) => l.kind === "service").map((l) => l.id)),
    ];
    const productIds = [
      ...new Set(lines.filter((l) => l.kind === "product").map((l) => l.id)),
    ];

    const [spRes, prodRes] = await Promise.all([
      serviceIds.length
        ? supabaseAdmin
            .from("service_prices")
            .select("service_id, price")
            .eq("salon_id", salonId)
            .in("service_id", serviceIds)
        : Promise.resolve({ data: [], error: null } as const),
      productIds.length
        ? supabaseAdmin.from("products").select("id, price").in("id", productIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);

    if (spRes.error || prodRes.error) {
      return NextResponse.json(
        { error: "Errore nel caricamento prezzi" },
        { status: 500 }
      );
    }

    const servicePriceMap = new Map<number, number>(
      (spRes.data ?? []).map((r: { service_id: number; price: unknown }) => [
        Number(r.service_id),
        Number(r.price),
      ])
    );

    if (serviceIds.length) {
      const missing = serviceIds.filter((id) => !servicePriceMap.has(id));
      if (missing.length) {
        return NextResponse.json(
          {
            error: `Prezzo mancante in service_prices per questo salone (servizio/i: ${missing.join(", ")})`,
          },
          { status: 400 }
        );
      }
    }

    const prodRows = (prodRes.data ?? []) as Array<{ id: number; price?: unknown }>;
    const prodMap = new Map<number, number>(
      prodRows.map((p) => [p.id, Number(p.price)])
    );

    if (productIds.length) {
      const productRowById = new Map(prodRows.map((p) => [p.id, p]));
      const badProductIds = productIds.filter((id) => {
        const row = productRowById.get(id);
        if (!row) return true;
        const raw = row.price;
        if (raw === null || raw === undefined) return true;
        const n = Number(raw);
        return Number.isNaN(n) || !Number.isFinite(n);
      });
      if (badProductIds.length) {
        return NextResponse.json(
          {
            error: `Prezzo mancante o non valido per questo prodotto (id: ${badProductIds.join(", ")})`,
          },
          { status: 400 }
        );
      }
    }

    // 7) TOTALI
    let subtotal = 0;
    let totalDiscount = 0;

    const computedItems = lines.map((l) => {
      const rawUnit =
        l.kind === "service" ? servicePriceMap.get(l.id) : prodMap.get(l.id);
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

    // 7.5) GUARDIA MINIMA ANTI-DOPPIO INVIO (solo vendite senza appuntamento)
    if (!appointmentId) {
      if (idempotencyKey) {
        const { data: existingByKey, error: existingByKeyErr } = await supabaseAdmin
          .from("sales")
          .select("id")
          .eq("salon_id", salonId)
          .eq("idempotency_key", idempotencyKey)
          .limit(1)
          .maybeSingle();

        if (existingByKeyErr) {
          return NextResponse.json(
            {
              error: "Errore controllo idempotenza vendita",
              details: existingByKeyErr.message,
            },
            { status: 500 }
          );
        }

        if (existingByKey?.id != null) {
          const replaySaleId = Number(existingByKey.id);
          if (printerEnabled && fiscalProfileForJob) {
            const fiscalRes = await ensureFiscalJobAndMaybeQueueSale({
              saleId: replaySaleId,
              salonId,
              userId,
              fiscal: fiscalProfileForJob,
              finalTotal,
              paymentMethod,
            });
            if (!fiscalRes.ok) {
              return NextResponse.json(fiscalRes.body, { status: fiscalRes.status });
            }
            return NextResponse.json({
              ok: true,
              sale_id: replaySaleId,
              fiscal_print_job_id: fiscalRes.fiscalPrintJobId,
              printer_enabled: printerEnabled,
              totals: { subtotal, total: finalTotal, discount: totalDiscount },
              idempotent_replay: true,
            });
          }
          return NextResponse.json({
            ok: true,
            sale_id: replaySaleId,
            idempotent_replay: true,
          });
        }
      }

      const now = new Date();
      const fiveSecondsAgo = new Date(now.getTime() - 5_000).toISOString();

      const { data: recentSales, error: dupErr } = await supabaseAdmin
        .from("sales")
        .select("id")
        .eq("salon_id", salonId)
        .eq("payment_method", paymentMethod)
        .eq("total_amount", finalTotal)
        .gte("date", fiveSecondsAgo)
        .limit(1);

      if (dupErr) {
        return NextResponse.json(
          { error: "Errore controllo doppia vendita", details: dupErr.message },
          { status: 500 }
        );
      }

      if (recentSales && recentSales.length > 0) {
        return NextResponse.json(
          {
            error: "Possibile doppio invio: vendita identica già registrata negli ultimi secondi",
          },
          { status: 409 }
        );
      }
    }

    // 8) CHIUSURA ATOMICA VIA RPC (sales + sale_items + stock_move + appointment)
    const pItems = computedItems.map((l) => ({
      kind: l.kind,
      ref_id: l.id,
      staff_id: staffId,
      quantity: l.qty,
      price: l.unitPrice,
      discount: l.lineDisc,
    }));

    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(
      "close_sale_atomic",
      {
        p_salon_id: salonId,
        p_customer_id: customerId,
        p_total_amount: finalTotal,
        p_payment_method: paymentMethod,
        p_discount: totalDiscount,
        p_items: pItems,
        p_appointment_id: appointmentId ?? null,
        p_idempotency_key: !appointmentId ? idempotencyKey : null,
      }
    );

    if (rpcErr) {
      return NextResponse.json(
        { error: rpcErr.message ?? "Errore chiusura cassa" },
        { status: 500 }
      );
    }

    const saleId =
      Array.isArray(rpcData) && rpcData.length > 0
        ? (rpcData[0] as { sale_id: number }).sale_id
        : null;
    if (saleId == null || !Number.isFinite(saleId)) {
      return NextResponse.json(
        { error: "RPC non ha restituito sale_id" },
        { status: 500 }
      );
    }

    let fiscalPrintJobId: number | undefined;

    if (printerEnabled && fiscalProfileForJob) {
      const fiscalRes = await ensureFiscalJobAndMaybeQueueSale({
        saleId,
        salonId,
        userId,
        fiscal: fiscalProfileForJob,
        finalTotal,
        paymentMethod,
      });
      if (!fiscalRes.ok) {
        return NextResponse.json(fiscalRes.body, { status: fiscalRes.status });
      }
      fiscalPrintJobId = fiscalRes.fiscalPrintJobId;
    }

    return NextResponse.json({
      ok: true,
      sale_id: saleId,
      fiscal_print_job_id: fiscalPrintJobId,
      printer_enabled: printerEnabled,
      totals: { subtotal, total: finalTotal, discount: totalDiscount },
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}