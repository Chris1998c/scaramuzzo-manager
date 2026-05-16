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
  staff_id?: number | null;
};

type NormalizedCloseLine = {
  kind: LineKind;
  id: number;
  qty: number;
  discountPct: number;
  /** Da payload client; risoluzione finale avviene più sotto. */
  staff_id: number | null;
};

type AppointmentServiceLine = {
  id: number;
  service_id: number;
  staff_id: number | null;
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

/** RPC può restituire bigint → NextResponse.json non serializza BigInt (500 HTML). */
function coerceRpcBigintField(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "bigint") return Number(v);
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function coerceRpcCloseSale(row: unknown): {
  saleId: number | null;
  fiscalPrintJobId: number | null;
  reusedSale: boolean;
} {
  if (!row || typeof row !== "object") {
    return { saleId: null, fiscalPrintJobId: null, reusedSale: false };
  }
  const r = row as {
    sale_id?: unknown;
    fiscal_print_job_id?: unknown;
    reused_sale?: unknown;
  };
  return {
    saleId: coerceRpcBigintField(r.sale_id),
    fiscalPrintJobId: coerceRpcBigintField(r.fiscal_print_job_id),
    reusedSale: r.reused_sale === true,
  };
}

function normalizeOptionalStaffId(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = toInt(v, NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeLines(body: CloseBody): NormalizedCloseLine[] {
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
      staff_id: normalizeOptionalStaffId(l?.staff_id),
    }))
    .filter(
      (l) =>
        (l.kind === "service" || l.kind === "product") &&
        Number.isFinite(l.id) &&
        l.id > 0 &&
        Number.isFinite(l.qty) &&
        l.qty > 0
    ) as NormalizedCloseLine[];
}

/** Staff operativo su riga servizio da appointment_services (match per service_id). */
function resolveServiceLineStaffId(
  serviceId: number,
  payloadStaffId: number | null,
  appointmentHeaderStaffId: number | null,
  appointmentServiceLines: AppointmentServiceLine[],
): number | null {
  if (payloadStaffId != null) return payloadStaffId;

  const matches = appointmentServiceLines.filter((l) => l.service_id === serviceId);
  if (matches.length === 0) return appointmentHeaderStaffId;

  if (matches.length === 1) {
    return matches[0].staff_id ?? appointmentHeaderStaffId;
  }

  const distinctStaff = new Set<number>();
  for (const m of matches) {
    if (m.staff_id != null && m.staff_id > 0) distinctStaff.add(m.staff_id);
  }
  if (distinctStaff.size === 1) return [...distinctStaff][0]!;
  return appointmentHeaderStaffId;
}

/** staff_id per ogni riga vendita (ordine allineato a computedItems). */
function resolveStaffIdPerSaleLine(
  computedItems: ComputedSaleLine[],
  ctx: {
    appointmentId: number | null;
    appointmentHeaderStaffId: number | null;
    appointmentServiceLines: AppointmentServiceLine[];
    operatorStaffId: number | null;
  },
): Array<number | null> {
  let firstServiceStaffId: number | null = null;
  const out: Array<number | null> = [];

  for (const item of computedItems) {
    if (item.kind === "service") {
      let staffId: number | null;
      if (ctx.appointmentId) {
        staffId = resolveServiceLineStaffId(
          item.id,
          item.staff_id,
          ctx.appointmentHeaderStaffId,
          ctx.appointmentServiceLines,
        );
      } else {
        staffId = item.staff_id ?? ctx.operatorStaffId ?? null;
      }
      out.push(staffId);
      if (firstServiceStaffId == null && staffId != null) {
        firstServiceStaffId = staffId;
      }
      continue;
    }

    if (item.staff_id != null) {
      out.push(item.staff_id);
      continue;
    }

    if (ctx.appointmentId) {
      out.push(firstServiceStaffId ?? ctx.appointmentHeaderStaffId ?? null);
    } else {
      out.push(ctx.operatorStaffId ?? null);
    }
  }

  return out;
}

type FiscalProfileForJob = {
  printer_model?: string;
  printer_serial?: string;
  legal_name?: string;
  vat_number?: string;
};

type FiscalSaleReceiptLine = {
  type: LineKind;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  department: number;
  vat_rate: number;
};

type ComputedSaleLine = NormalizedCloseLine & {
  unitPrice: number;
  lineDisc: number;
  net: number;
};

/** Righe scontrino fiscale: totali allineati a `finalTotal` ripartendo lo sconto globale sulle righe già nette per sconto di riga. */
function buildFiscalSaleReceiptLines(args: {
  computedItems: ComputedSaleLine[];
  subtotal: number;
  globalDiscountAmount: number;
  finalTotal: number;
  serviceNameById: Map<number, string>;
  productNameById: Map<number, string>;
}): FiscalSaleReceiptLine[] {
  const { computedItems, subtotal, globalDiscountAmount, finalTotal } = args;
  const n = computedItems.length;
  if (!n) return [];

  let sumGlobalShares = 0;
  const globalShares: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = computedItems[i];
    if (i === n - 1) {
      globalShares.push(round2(globalDiscountAmount - sumGlobalShares));
    } else {
      const share =
        subtotal > 0 ? round2((c.net / subtotal) * globalDiscountAmount) : 0;
      globalShares.push(share);
      sumGlobalShares = round2(sumGlobalShares + share);
    }
  }

  const lineTotals = computedItems.map((c, i) =>
    round2(c.net - (globalShares[i] ?? 0))
  );

  const sumLines = round2(lineTotals.reduce((a, b) => a + b, 0));
  const drift = round2(finalTotal - sumLines);
  if (lineTotals.length && drift !== 0) {
    const last = lineTotals.length - 1;
    lineTotals[last] = round2(lineTotals[last] + drift);
  }

  return computedItems.map((c, i) => {
    const qty = c.qty;
    const total = lineTotals[i] ?? 0;
    const unit_price = qty > 0 ? round2(total / qty) : round2(total);
    const fallback = c.kind === "service" ? "SERVIZIO" : "PRODOTTO";
    const raw =
      (c.kind === "service"
        ? args.serviceNameById.get(c.id)
        : args.productNameById.get(c.id)) ?? "";
    const name =
      typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : fallback;

    return {
      type: c.kind,
      name,
      quantity: qty,
      unit_price,
      total,
      department: 1,
      vat_rate: 22,
    };
  });
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
    let appointmentHeaderStaffId: number | null = null;
    let customerId: string | null = null;
    let appointmentId: number | null = null;
    let appointmentServiceLines: AppointmentServiceLine[] = [];
    const operatorStaffId = normalizeOptionalStaffId(access.staffId);

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
      appointmentHeaderStaffId = normalizeOptionalStaffId(
        (appt as { staff_id?: unknown }).staff_id,
      );
      customerId =
        ((appt as { customer_id?: unknown }).customer_id as string | null) ?? null;

      const { data: apptSvcRows, error: apptSvcErr } = await supabaseAdmin
        .from("appointment_services")
        .select("id, service_id, staff_id")
        .eq("appointment_id", appointmentId);

      if (apptSvcErr) {
        return NextResponse.json(
          { error: "Errore caricamento righe appuntamento" },
          { status: 500 },
        );
      }

      appointmentServiceLines = (apptSvcRows ?? [])
        .map((row: Record<string, unknown>) => ({
          id: toInt(row.id, NaN),
          service_id: toInt(row.service_id, NaN),
          staff_id: normalizeOptionalStaffId(row.staff_id),
        }))
        .filter(
          (row): row is AppointmentServiceLine =>
            Number.isFinite(row.id) &&
            row.id > 0 &&
            Number.isFinite(row.service_id) &&
            row.service_id > 0,
        );

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

    const cashSessionRaw = (activeSession as { id?: unknown }).id;
    const cashSessionId =
      typeof cashSessionRaw === "bigint"
        ? Number(cashSessionRaw)
        : typeof cashSessionRaw === "number"
          ? Math.trunc(cashSessionRaw)
          : toInt(cashSessionRaw, NaN);
    if (!Number.isFinite(cashSessionId) || cashSessionId <= 0) {
      return NextResponse.json(
        { error: "Sessione cassa senza id valido" },
        { status: 500 }
      );
    }

    const printerEnabled = Boolean(
      (activeSession as { printer_enabled?: unknown }).printer_enabled
    );

    const bridge = await checkPrintBridgeReachable();
    const printBridgeReachable = bridge.ok;
    const printBridgeWarning = bridge.ok ? undefined : bridge.error;

    const { data: profile, error: profErr } = await supabaseAdmin.rpc(
      "get_fiscal_profile",
      {
        p_salon_id: salonId,
        p_on_date: new Date().toISOString().slice(0, 10),
      }
    );
    const fiscalProfileForJob: FiscalProfileForJob | null =
      !profErr && profile?.length
        ? (profile[0] as FiscalProfileForJob)
        : null;

    if (printerEnabled && !fiscalProfileForJob) {
      return NextResponse.json(
        {
          error:
            "Profilo fiscale non trovato per questo salone. Impossibile stampare.",
        },
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

    const [spRes, prodRes, svcRes] = await Promise.all([
      serviceIds.length
        ? supabaseAdmin
            .from("service_prices")
            .select("service_id, price")
            .eq("salon_id", salonId)
            .in("service_id", serviceIds)
        : Promise.resolve({ data: [], error: null } as const),
      productIds.length
        ? supabaseAdmin
            .from("products")
            .select("id, price, name")
            .in("id", productIds)
        : Promise.resolve({ data: [], error: null } as const),
      serviceIds.length
        ? supabaseAdmin.from("services").select("id, name").in("id", serviceIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);

    if (spRes.error || prodRes.error || svcRes.error) {
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

    const prodRows = (prodRes.data ?? []) as Array<{
      id: number;
      price?: unknown;
      name?: unknown;
    }>;
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

    const serviceNameById = new Map<number, string>(
      (svcRes.data ?? []).map((r: { id: number; name: unknown }) => [
        Number(r.id),
        typeof r.name === "string" ? r.name : "",
      ])
    );

    const productNameById = new Map<number, string>(
      prodRows.map((p) => [p.id, typeof p.name === "string" ? p.name : ""])
    );

    // 7) TOTALI
    let subtotal = 0;
    let totalDiscount = 0;

    const computedItems: ComputedSaleLine[] = lines.map((l) => {
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

    const fiscalLines = buildFiscalSaleReceiptLines({
      computedItems,
      subtotal,
      globalDiscountAmount,
      finalTotal,
      serviceNameById,
      productNameById,
    });

    const fiscalEnabled = printerEnabled && fiscalProfileForJob != null;
    const fiscalPayload = fiscalEnabled
      ? {
          total_amount: finalTotal,
          payment_method: paymentMethod,
          legal_name: fiscalProfileForJob.legal_name,
          vat_number: fiscalProfileForJob.vat_number,
          printer_model: fiscalProfileForJob.printer_model,
          printer_serial: fiscalProfileForJob.printer_serial,
          requested_at: new Date().toISOString(),
          items: fiscalLines,
        }
      : null;

    // 7.5) GUARDIA MINIMA ANTI-DOPPIO INVIO (solo vendite senza appuntamento)
    if (!appointmentId) {
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

    // 8) CHIUSURA ATOMICA VIA RPC (vendita + job fiscale + stock + appointment)
    const staffIdPerLine = resolveStaffIdPerSaleLine(computedItems, {
      appointmentId,
      appointmentHeaderStaffId,
      appointmentServiceLines,
      operatorStaffId,
    });

    const pItems = computedItems.map((l, index) => ({
      kind: l.kind,
      ref_id: l.id,
      staff_id: staffIdPerLine[index] ?? null,
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
        p_cash_session_id: cashSessionId,
        p_appointment_id: appointmentId ?? null,
        p_idempotency_key: !appointmentId ? idempotencyKey : null,
        p_created_by: userId,
        p_fiscal_enabled: fiscalEnabled,
        p_fiscal_payload: fiscalPayload,
        p_fiscal_bridge_reachable: printBridgeReachable,
      }
    );

    if (rpcErr) {
      console.error("[CASSA_CLOSE_PRODUCT_ERROR]", rpcErr);
      return NextResponse.json(
        { error: rpcErr.message ?? "Errore chiusura cassa" },
        { status: 500 }
      );
    }

    const rpcRow =
      Array.isArray(rpcData) && rpcData.length > 0 ? rpcData[0] : null;
    const { saleId, fiscalPrintJobId, reusedSale } = coerceRpcCloseSale(rpcRow);

    if (saleId == null || !Number.isFinite(saleId)) {
      return NextResponse.json(
        { error: "RPC non ha restituito sale_id" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ok: true,
      sale_id: saleId,
      fiscal_print_job_id: fiscalPrintJobId ?? undefined,
      printer_enabled: printerEnabled,
      ...(fiscalEnabled
        ? {
            print_bridge_reachable: printBridgeReachable,
            ...(printBridgeWarning
              ? { print_bridge_warning: printBridgeWarning }
              : {}),
          }
        : {}),
      totals: { subtotal, total: finalTotal, discount: totalDiscount },
      ...(reusedSale ? { idempotent_replay: true as const } : {}),
    });
  } catch (e) {
    console.error("[CASSA_CLOSE_PRODUCT_ERROR]", e);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}