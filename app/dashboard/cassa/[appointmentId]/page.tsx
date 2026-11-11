// app/dashboard/cassa/[appointmentId]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { fetchCashServices } from "@/lib/servicesCatalog";
import { agendaVisualFromServiceRow } from "@/lib/agendaServiceVisual";
import Link from "next/link";
import {
  CASSA_STOCK_INSUFFICIENT_CODE,
  formatCassaStockInsufficientMessage,
} from "@/lib/cassa/cassaStockError";
import { cassaCloseSuccessToast } from "@/lib/cassa/cassaCloseSuccessToast";
import { toast } from "sonner";
import FiscalDocumentCard from "@/components/cassa/FiscalDocumentCard";
import {
  canAddCashProduct,
  cashProductStockLabel,
  cashProductStockStatus,
  fetchCashProductsForSalon,
  validateCartProductStock,
  type CashCatalogProduct,
} from "@/lib/cassa/cashProductStock";

/* =======================
   TYPES
======================= */

type PaymentMethod = "cash" | "card";

type CashItem = {
  kind: "service" | "product";
  id: number;
  name: string;
  unitPrice: number;
  qty: number;
  discountEur: number; // UX: € per riga
  /** Accento tipo servizio (palette Agenda), solo kind=service */
  accentHex?: string;
};

type CassaStatusResponse = {
  ok: boolean;
  is_open: boolean;
  salon?: { id: number; name: string | null };
  session?: any | null;
  totals?: any | null;
  error?: string;
};

const round2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
const toNum = (v: any, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);

/* =======================
   PAGE
======================= */

export default function CassaPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useParams<{ appointmentId: string }>();
  const appointmentId = Number(params?.appointmentId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [appointment, setAppointment] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);

  const [services, setServices] = useState<any[]>([]);
  const [products, setProducts] = useState<CashCatalogProduct[]>([]);

  const [items, setItems] = useState<CashItem[]>([]);
  /** Evita che un secondo load (es. React Strict Mode in dev) sovrascriva il carrello con solo i servizi da appuntamento. */
  const initialCartSeededForAppointmentRef = useRef<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [globalDiscountEur, setGlobalDiscountEur] = useState(0);

  const [closing, setClosing] = useState(false);

  // Cassa status
  const [cassaLoading, setCassaLoading] = useState(false);
  const [cassa, setCassa] = useState<CassaStatusResponse | null>(null);

  // Open cassa UI
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [opening, setOpening] = useState(false);

  /** Allineato a cash_sessions.printer_enabled: se true richiede Print Bridge + job fiscale */
  const [printerEnabled, setPrinterEnabled] = useState(true);

  /* =======================
     LOAD DATA & AUTO-FILL
  ======================= */

  async function refreshCassaStatus(salonId: number) {
    setCassaLoading(true);
    try {
      const res = await fetch(
        `/api/cassa/status?salon_id=${encodeURIComponent(String(salonId))}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );
      const data = (await res.json()) as CassaStatusResponse;
      if (!res.ok)
        throw new Error((data as any)?.error || "Errore status cassa");
      setCassa(data);
    } catch (e: any) {
      setCassa({
        ok: false,
        is_open: false,
        error: e?.message || "Errore status cassa",
      });
    } finally {
      setCassaLoading(false);
    }
  }

useEffect(() => {
  let cancelled = false;

  async function load() {
    setLoading(true);
    setError("");

    if (!Number.isFinite(appointmentId)) {
      setError("ID appuntamento non valido");
      setLoading(false);
      return;
    }

    // 1) Appuntamento + righe servizi (con price salvato) + nome servizio
    const { data: a, error: aErr } = await supabase
      .from("appointments")
      .select(
        `
        id, salon_id, customer_id, staff_id, status, sale_id,
        appointment_services (
          id,
          service_id,
          price,
          service:service_id (
            id,
            name,
            category_id,
            service_categories ( id, name )
          )
        )
      `,
      )
      .eq("id", appointmentId)
      .single();

    if (aErr || !a) {
      setError("Appuntamento non trovato");
      setLoading(false);
      return;
    }

    // 2) Cliente
    let c = null;
    if (a.customer_id) {
      const { data: cd } = await supabase
        .from("customers")
        .select("first_name, last_name, phone")
        .eq("id", a.customer_id)
        .single();
      c = cd ?? null;
    }

// 3) Catalogo cassa (dropdown): active + visible_in_cash + prezzi salone (fetchCashServices)
const salonId = Number(a.salon_id);
const asRows: any[] = Array.isArray(a.appointment_services) ? a.appointment_services : [];

const [cashRows, cashProducts] = await Promise.all([
  fetchCashServices(supabase, salonId).catch((e) => {
    console.error("fetchCashServices", e);
    return [] as Awaited<ReturnType<typeof fetchCashServices>>;
  }),
  fetchCashProductsForSalon(supabase, salonId).catch((e) => {
    console.error("fetchCashProductsForSalon", e);
    return [] as CashCatalogProduct[];
  }),
]);

// 4) service_prices per righe appuntamento (fallback) anche se il servizio non è più nel catalogo cassa
const apptServiceIds = asRows
  .map((as: any) => Number(as.service_id))
  .filter((x: number) => Number.isFinite(x) && x > 0);
const priceLookupIds = [
  ...new Set([...cashRows.map((s) => s.id), ...apptServiceIds]),
];

const priceMap = new Map<string, number>();
if (Number.isFinite(salonId) && salonId > 0 && priceLookupIds.length) {
  const { data: sp, error: spErr } = await supabase
    .from("service_prices")
    .select("service_id, price")
    .eq("salon_id", salonId)
    .in("service_id", priceLookupIds);

  if (spErr) {
    console.error("Errore service_prices", spErr);
  } else {
    (sp || []).forEach((p: any) => {
      priceMap.set(String(p.service_id), Number(p.price));
    });
  }
}

const mergedServices = cashRows.map((s) => ({
  id: s.id,
  name: String(s.name ?? "Servizio"),
  price: s.price,
  active: true,
  accent: agendaVisualFromServiceRow(s).accent,
}));

if (cancelled) return;

setAppointment(a);
setCustomer(c);
setServices(mergedServices);
setProducts(cashProducts);


    // 5) Auto-popola righe: price = salvato, se 0 -> fallback da service_prices (se esiste)
    if (initialCartSeededForAppointmentRef.current !== appointmentId) {
      initialCartSeededForAppointmentRef.current = appointmentId;
      if (asRows.length) {
        const initialItems: CashItem[] = asRows.map((as: any) => {
          const saved = toNum(as.price, 0);
          const fallback = priceMap.get(String(as.service_id)) ?? 0;
          const unitPrice = saved > 0 ? saved : fallback;

          return {
            kind: "service" as const,
            id: Number(as.service_id),
            name: String(as.service?.name ?? "Servizio"),
            unitPrice,
            qty: 1,
            discountEur: 0,
            accentHex: agendaVisualFromServiceRow(as.service ?? {}).accent,
          };
        });

        setItems(initialItems);
      } else {
        setItems([]);
      }
    }

    // 6) Status cassa
    if (Number.isFinite(salonId) && salonId > 0) {
      refreshCassaStatus(salonId);
    } else {
      setCassa({ ok: false, is_open: false, error: "salon_id appuntamento non valido" });
    }

    setLoading(false);
  }

  load();
  return () => {
    cancelled = true;
  };
}, [appointmentId, supabase]);

  useEffect(() => {
    const pe = cassa?.session?.printer_enabled;
    if (typeof pe === "boolean") setPrinterEnabled(pe);
  }, [cassa?.session?.printer_enabled]);

  async function setPrinterEnabledPersist(next: boolean) {
    const salonId = Number(appointment?.salon_id);
    if (!Number.isFinite(salonId) || salonId <= 0) return;
    if (!cassa?.is_open) return;
    setPrinterEnabled(next);
    try {
      const res = await fetch("/api/cassa/session-printer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salon_id: salonId, printer_enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Errore salvataggio");
      await refreshCassaStatus(salonId);
      toast.success(
        next
          ? "Stampante fiscale attiva per questa sessione."
          : "Stampante fiscale disattivata: le vendite si salveranno senza stampa.",
      );
    } catch (e: any) {
      setPrinterEnabled(!next);
      toast.error(e?.message || "Errore");
    }
  }

  /* =======================
     HANDLERS
  ======================= */

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  function productQtyInCart(prev: CashItem[], productId: number): number {
    return prev
      .filter((it) => it.kind === "product" && it.id === productId)
      .reduce((s, it) => s + it.qty, 0);
  }

  function addItem(kind: "service" | "product", source: any) {
    if (kind === "product") {
      const p = source as CashCatalogProduct;
      if (!canAddCashProduct(p)) {
        toast.error(
          p.stockQty <= 0 ? "Prodotto esaurito" : "Prodotto non disponibile",
        );
        return;
      }
    }

    setItems((prev) => {
      const id = Number(source?.id);
      if (!Number.isFinite(id) || id <= 0) return prev;

      if (kind === "product") {
        const catalog = productById.get(id) ?? (source as CashCatalogProduct);
        const inCart = productQtyInCart(prev, id);
        if (inCart + 1 > catalog.stockQty) {
          toast.error("Giacenza insufficiente");
          return prev;
        }
      }

      const existingIdx = prev.findIndex(
        (it) => it.kind === kind && it.id === id,
      );
      if (existingIdx > -1 && kind === "product") {
        return prev.map((it, i) =>
          i === existingIdx ? { ...it, qty: it.qty + 1 } : it,
        );
      }

      return [
        ...prev,
        {
          kind,
          id,
          name: String(
            source?.name ?? (kind === "service" ? "Servizio" : "Prodotto"),
          ),
          unitPrice: toNum(source?.price, 0),
          qty: 1,
          discountEur: 0,
          ...(kind === "service"
            ? {
                accentHex:
                  typeof (source as any)?.accent === "string"
                    ? (source as any).accent
                    : agendaVisualFromServiceRow(source ?? {}).accent,
              }
            : {}),
        },
      ];
    });
  }

  function updateItem(idx: number, patch: Partial<CashItem>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        next.qty = Math.max(1, Math.trunc(toNum(next.qty, 1)));
        next.unitPrice = Math.max(0, toNum(next.unitPrice, 0));
        next.discountEur = Math.max(0, toNum(next.discountEur, 0));
        const gross = next.unitPrice * next.qty;
        if (next.discountEur > gross) next.discountEur = gross; // no negativi
        return next;
      }),
    );
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function buildSubmitItems(rows: CashItem[]): CashItem[] {
    const out: CashItem[] = [];
    const productIndex = new Map<number, number>();

    for (const row of rows) {
      if (row.kind === "product") {
        const idx = productIndex.get(row.id);
        if (idx != null) {
          const prev = out[idx];
          out[idx] = {
            ...prev,
            qty: prev.qty + row.qty,
            // Manteniamo coerenza totale sommando gli sconti riga.
            discountEur: prev.discountEur + row.discountEur,
          };
          continue;
        }
        productIndex.set(row.id, out.length);
      }
      out.push({ ...row });
    }

    return out;
  }

  function duplicateItem(idx: number): void {
    setItems((prev) => {
      const it = prev[idx];
      if (!it) return prev;
      if (it.kind === "product") {
        const catalog = productById.get(it.id);
        const inCart = productQtyInCart(prev, it.id);
        if ((catalog?.stockQty ?? 0) < inCart + 1) {
          toast.error("Giacenza insufficiente");
          return prev;
        }
        return prev.map((row, i) =>
          i === idx ? { ...row, qty: row.qty + 1 } : row,
        );
      }
      return [
        ...prev.slice(0, idx + 1),
        { ...it },
        ...prev.slice(idx + 1),
      ];
    });
  }

  /* =======================
     TOTALI (UX)
  ======================= */

  const subtotal = round2(
    items.reduce((s, i) => {
      const gross = i.unitPrice * i.qty;
      const disc = Math.min(i.discountEur, gross);
      return s + (gross - disc);
    }, 0),
  );

  const globalDisc = clamp(toNum(globalDiscountEur, 0), 0, subtotal);
  const total = round2(Math.max(0, subtotal - globalDisc));
  const isNotInSala =
    appointment?.status !== "in_sala" && appointment?.status !== "done";

  const linkedSaleId = Number(appointment?.sale_id);
  const hasLinkedSale =
    Number.isFinite(linkedSaleId) && linkedSaleId > 0;

  const stockValidation = useMemo(
    () => validateCartProductStock(items, products),
    [items, products],
  );

  const canClose =
    !closing &&
    !isNotInSala &&
    items.length > 0 &&
    Boolean(appointment?.id) &&
    Boolean(appointment?.salon_id) &&
    cassa?.is_open === true &&
    stockValidation.ok;

  const closeBlockReason = useMemo(() => {
    if (stockValidation.ok) return null;
    return stockValidation.message;
  }, [stockValidation]);

  async function handleOpenCassa() {
    if (opening) return;
    const salonId = Number(appointment?.salon_id);
    if (!Number.isFinite(salonId) || salonId <= 0) return;

    setOpening(true);
    try {
      const res = await fetch("/api/cassa/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salon_id: salonId,
          opening_cash: round2(Math.max(0, toNum(openingCash, 0))),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Errore apertura cassa");
      await refreshCassaStatus(salonId);
      toast.success("Cassa aperta ✅");
    } catch (e: any) {
      toast.error(e?.message || "Errore apertura cassa");
    } finally {
      setOpening(false);
    }
  }

  async function handleClose() {
    if (!canClose) return;

    setClosing(true);

    // Convertiamo sconti € -> % per API (backend lavora in percentuale)
    const lines = buildSubmitItems(items).map((it) => {
      const gross = it.unitPrice * it.qty;
      const discEur = Math.min(it.discountEur, gross);
      const discountPct = gross > 0 ? (discEur / gross) * 100 : 0;
      return {
        kind: it.kind,
        id: it.id,
        qty: Math.max(1, Math.trunc(it.qty)),
        discount: Number(discountPct.toFixed(4)), // %
      };
    });

    const globalDiscountPct = subtotal > 0 ? (globalDisc / subtotal) * 100 : 0;

    try {
      const res = await fetch("/api/cassa/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: appointment.id,
          payment_method: paymentMethod,
          global_discount: Number(globalDiscountPct.toFixed(4)), // %
          lines,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.code === CASSA_STOCK_INSUFFICIENT_CODE) {
          const pid =
            data?.product_id != null && Number.isFinite(Number(data.product_id))
              ? Number(data.product_id)
              : null;
          const productName =
            pid != null
              ? items.find((it) => it.kind === "product" && it.id === pid)?.name
              : null;
          toast.error(
            formatCassaStockInsufficientMessage({
              productId: pid,
              productName,
            }),
            { duration: 10_000 }
          );
          setClosing(false);
          return;
        }
        throw new Error(data?.error || "Errore durante il salvataggio");
      }

      const rawJob = data?.fiscal_print_job_id;
      const jobId =
        typeof rawJob === "number"
          ? rawJob
          : rawJob != null && !Number.isNaN(Number(rawJob))
            ? Number(rawJob)
            : undefined;
      const printerEnabledRes =
        typeof data?.printer_enabled === "boolean"
          ? data.printer_enabled
          : typeof printerEnabled === "boolean"
            ? printerEnabled
            : null;

      const closeToast = cassaCloseSuccessToast({
        warning: data?.warning != null ? String(data.warning) : null,
        fiscalPrintJobId: jobId ?? null,
        printerEnabled: printerEnabledRes,
      });
      if (closeToast.tone === "warning") {
        toast.warning(closeToast.title, {
          description: closeToast.description,
          duration: 12_000,
        });
      } else {
        toast.success(closeToast.title, {
          description: closeToast.description,
          duration: jobId != null ? 9500 : 7000,
        });
      }

      router.push("/dashboard/in-sala");
    } catch (err: any) {
      toast.error(err?.message || "Errore chiusura");

      setClosing(false);
    }
  }

  /* =======================
     UI
  ======================= */

  if (loading)
    return (
      <div className="p-8 text-[#f3d8b6] animate-pulse font-bold">
        Inizializzazione check-out...
      </div>
    );

  if (error)
    return (
      <div className="p-8 text-red-400 bg-red-500/10 rounded-2xl m-6 border border-red-500/20">
 {error}
 </div>
 );

 const customerLabel = customer
 ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() ||
 "Cliente"
 : "Cliente Occasionale";

  const salonName = cassa?.salon?.name ?? null;

  return (
    <div className="min-h-screen px-3 py-4 md:px-5 md:py-5 pb-10 text-white max-w-6xl mx-auto space-y-3 animate-in fade-in duration-500">
      {isNotInSala && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 space-y-2">
          <p className="text-sm font-semibold text-red-200">Appuntamento non in sala</p>
          <p className="text-sm text-red-200/80">
            Porta il cliente in sala, poi torna qui per chiudere lo scontrino.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/in-sala"
              className="h-9 px-3 rounded-lg text-sm font-semibold bg-[#f3d8b6] text-black inline-flex items-center"
            >
              In sala
            </Link>
            <Link
              href="/dashboard/agenda"
              className="h-9 px-3 rounded-lg text-sm border border-white/10 text-white/80 inline-flex items-center"
            >
              Agenda
            </Link>
          </div>
        </div>
      )}

      {/* Contesto + totale (titolo pagina già nell’header: Check-out cassa) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href="/dashboard/in-sala"
            className="text-xs text-white/45 hover:text-[#f3d8b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded"
          >
            ← In sala
          </Link>
          <p className="text-lg font-semibold text-[#f3d8b6] truncate">{customerLabel}</p>
          <p className="text-sm text-white/50 truncate">
            {salonName ?? `Salone #${appointment?.salon_id}`}
          </p>
        </div>
        <div className="shrink-0 text-left sm:text-right rounded-xl border border-[#f3d8b6]/30 bg-[#f3d8b6]/10 px-4 py-3">
          <div className="text-xs text-[#f3d8b6]/80">Totale</div>
          <div className="text-2xl font-semibold tabular-nums text-[#f3d8b6]">
            € {total.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Stato cassa + stampante */}
      <div className="rounded-xl border border-white/[0.08] bg-scz-dark px-3 py-3 md:px-4 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-medium text-white/55">Stato cassa</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
              cassaLoading
                ? "bg-white/10 text-white/50"
                : cassa?.is_open
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-red-500/20 text-red-300"
            }`}
          >
            {cassaLoading ? "Verifica…" : cassa?.is_open ? "Aperta" : "Chiusa"}
          </span>
          {cassa?.error ? (
            <span className="text-sm text-red-400/90">{cassa.error}</span>
          ) : (
            <span className="text-sm text-white/45">
              {cassa?.is_open
                ? "Puoi chiudere lo scontrino in fondo"
                : "Apri la cassa per abilitare la chiusura"}
            </span>
          )}
          {cassa?.is_open ? (
            <button
              type="button"
              onClick={async () => {
                await refreshCassaStatus(Number(appointment?.salon_id));
                toast.message("Stato cassa aggiornato");
              }}
              className="h-9 px-3 rounded-lg border border-white/10 text-sm text-white/70 hover:bg-white/[0.06] sm:ml-auto"
            >
              Aggiorna
            </button>
          ) : null}
        </div>

        {cassa?.is_open ? (
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/[0.06]">
            <span className="text-sm text-white/55">Stampante in chiusura</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                printerEnabled
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/15 text-amber-200"
              }`}
            >
              {printerEnabled ? "Abilitata (sessione)" : "Disabilitata (sessione)"}
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-white/85">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/20 bg-black/40"
                checked={printerEnabled}
                onChange={(e) => void setPrinterEnabledPersist(e.target.checked)}
              />
              Usa stampante alla registrazione
            </label>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/[0.06]">
            <label className="text-xs text-white/45" htmlFor="cassa-opening-cash">
              Fondo cassa (€)
            </label>
            <input
              id="cassa-opening-cash"
              type="number"
              min={0}
              step={5}
              value={openingCash}
              onChange={(e) => setOpeningCash(Math.max(0, Number(e.target.value) || 0))}
              className="w-24 bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-sm font-semibold text-white focus:border-[#f3d8b6]/50 outline-none"
            />
            <button
              type="button"
              onClick={handleOpenCassa}
              disabled={opening}
              className={`h-9 px-3 rounded-lg text-sm font-semibold ${
                opening
                  ? "bg-white/5 text-white/30 cursor-not-allowed border border-white/10"
                  : "bg-[#f3d8b6] text-black hover:opacity-95"
              }`}
            >
              {opening ? "Apertura…" : "Apri cassa"}
            </button>
          </div>
        )}
      </div>

      {hasLinkedSale && <FiscalDocumentCard saleId={linkedSaleId} />}

      {/* AGGIUNGI SERVIZI / PRODOTTI */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
        <div className="border-b border-white/10 bg-black/20 px-6 py-4">
          <div className="text-xs font-medium text-white/40">
            Aggiungi alla vendita
          </div>
          <div className="mt-1 text-sm text-white/50">
            Servizi e prodotti da listino
          </div>
        </div>
        <div className="p-6 md:p-7 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-white/40 block mb-2">
              Servizi
            </label>
            <select
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white/90 focus:border-[#f3d8b6]/50 focus:ring-1 focus:ring-[#f3d8b6]/20 outline-none appearance-none cursor-pointer text-sm"
 onChange={(e) => {
 const s = services.find((x) => x.id === Number(e.target.value));
 if (s) addItem("service", s);
 e.target.value = "";
 }}
 >
 <option value="">+ Aggiungi servizio...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — €{s.price}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-white/40 block mb-2">
              Prodotti
            </label>
            <select
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white/90 focus:border-[#f3d8b6]/50 focus:ring-1 focus:ring-[#f3d8b6]/20 outline-none appearance-none cursor-pointer text-sm"
 onChange={(e) => {
 const p = products.find((x) => x.id === Number(e.target.value));
 if (p) addItem("product", p);
 e.target.value = "";
 }}
 >
 <option value="">+ Aggiungi prodotto...</option>
              {products.map((p) => {
                const status = cashProductStockStatus(p.stockQty);
                const addable = canAddCashProduct(p);
                const qtyLabel =
                  p.stockQty % 1 === 0
                    ? String(Math.trunc(p.stockQty))
                    : p.stockQty.toFixed(1);
                return (
                  <option key={p.id} value={p.id} disabled={!addable}>
                    {p.name} — €{p.price.toFixed(2)} · {cashProductStockLabel(status)} (
                    {qtyLabel} pz)
                  </option>
                );
              })}
            </select>
            <p className="mt-1.5 text-[10px] text-white/45">
              {products.filter((p) => canAddCashProduct(p)).length} prodotti con giacenza
              in salone
            </p>
          </div>
        </div>
      </div>

      {/* ITEMS LIST — Cart enterprise */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
        <div className="border-b border-white/10 bg-black/20 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-white/40">
              Riepilogo Prestazioni e Vendite
            </div>
            <div className="mt-1 text-sm text-white/50">
              Servizi e prodotti in scontrino
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="rounded-full bg-[#f3d8b6]/10 border border-[#f3d8b6]/20 px-3 py-1.5 font-bold text-[#f3d8b6]">
 {items.length} {items.length === 1 ? "voce" : "voci"}
            </span>
            <span className="text-white/50">
              Subtotale <span className="font-extrabold text-white/90">€ {subtotal.toFixed(2)}</span>
            </span>
            <span className="text-white/40">
 {items.filter((i) => i.kind === "product").length} prodotti
            </span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[420px] md:max-h-[480px] overflow-y-auto">
          <table className="min-w-[720px] md:min-w-[800px] w-full text-sm">
            <thead>
              <tr className="bg-black/30">
                <th className="px-4 py-3 text-xs font-medium border-b border-white/10 text-left text-white/90 w-[90px]">Tipo</th>
                <th className="px-4 py-3 text-xs font-medium border-b border-white/10 text-left text-white/90 min-w-[160px]">Nome</th>
                <th className="px-4 py-3 text-xs font-medium border-b border-white/10 text-left text-white/50 min-w-[80px]">Operatore</th>
                <th className="px-4 py-3 text-xs font-medium border-b border-white/10 text-right text-white/90 w-[70px]">Qtà</th>
                <th className="px-4 py-3 text-xs font-medium border-b border-white/10 text-right text-white/90 w-[100px]">Prezzo unit.</th>
                <th className="px-4 py-3 text-xs font-medium border-b border-white/10 text-right text-white/90 w-[90px]">Sconto €</th>
                <th className="px-4 py-3 text-xs font-medium border-b border-white/10 text-right text-[#f3d8b6] w-[100px]">Totale riga</th>
                <th className="px-4 py-3 text-xs font-medium border-b border-white/10 text-right text-white/50 w-[100px]">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="text-4xl opacity-20 mb-3">🛒</div>
                    <div className="text-white/40 text-sm font-medium">Nessuna riga nel conto</div>
 </td>
 </tr>
 ) : (
 items.map((it, idx) => {
 const gross = it.unitPrice * it.qty;
 const disc = Math.min(it.discountEur, gross);
 const lineTotal = Math.max(0, gross - disc);
 const discPct = gross > 0 ? (disc / gross) * 100 : 0;
 const warnZero = it.unitPrice === 0;
 const warnHighDisc = discPct > 50;
 const warnQty = it.qty > 99;
 const catalogProduct =
 it.kind === "product" ? productById.get(it.id) : undefined;
 const lineStock =
 catalogProduct != null
 ? productQtyInCart(items, it.id)
 : 0;
 const warnStock =
 it.kind === "product" &&
 catalogProduct != null &&
 lineStock > catalogProduct.stockQty;
 const stockStatus =
 catalogProduct != null
 ? cashProductStockStatus(catalogProduct.stockQty)
 : null;
 const svcTint =
 it.kind === "service" && it.accentHex
                      ? `${it.accentHex}22`
                      : undefined;
                  return (
                    <tr
                      key={`${it.kind}-${it.id}-${idx}`}
                      className={`border-b border-white/5 transition-colors hover:bg-white/[0.06] group ${
                        idx % 2 === 0 ? "bg-black/5" : "bg-black/10"
                      }`}
                      style={
                        it.kind === "service" && it.accentHex
                          ? {
                              boxShadow: `inset 3px 0 0 0 ${it.accentHex}`,
                              background: `linear-gradient(90deg, ${svcTint} 0%, transparent 48%), ${
                                idx % 2 === 0 ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.18)"
                              }`,
                            }
                          : undefined
                      }
                    >
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={`inline-block text-[11px] font-medium px-2.5 py-1 rounded-lg ${
                            it.kind === "service"
                              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          }`}
                        >
                          {it.kind === "service" ? "Servizio" : "Prodotto"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-white/95 align-middle">
                        <span className="text-[#f3d8b6] drop-shadow-sm">{it.name}</span>
                        {(warnZero || warnHighDisc || warnQty || warnStock || stockStatus) && (
                          <div className="flex flex-wrap gap-1 mt-1">
 {it.kind === "product" && stockStatus && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-lg ${
                                  stockStatus === "out"
                                    ? "text-red-200/90 bg-red-500/15"
                                    : stockStatus === "low"
                                      ? "text-amber-200/90 bg-amber-500/15"
                                      : "text-emerald-200/90 bg-emerald-500/15"
                                }`}
                              >
                                {cashProductStockLabel(stockStatus)} ·{" "}
                                {catalogProduct!.stockQty % 1 === 0
                                  ? Math.trunc(catalogProduct!.stockQty)
                                  : catalogProduct!.stockQty.toFixed(1)}{" "}
                                pz
                              </span>
                            )}
                            {warnStock && (
                              <span className="text-[10px] text-red-200/90 bg-red-500/15 px-1.5 py-0.5 rounded-lg">
                                Giacenza insufficiente
                              </span>
                            )}
                            {warnZero && (
                              <span className="text-[10px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded-lg">Prezzo 0</span>
                            )}
                            {warnHighDisc && (
                              <span className="text-[10px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded-lg">Sconto alto</span>
                            )}
                            {warnQty && (
                              <span className="text-[10px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded-lg">Qtà alta</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/40 text-xs align-middle">—</td>
                      <td className="px-4 py-3 text-right align-middle">
 <input
 type="number"
                          min={1}
                          value={it.qty}
                          onChange={(e) =>
                            updateItem(idx, { qty: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="w-14 bg-black/40 border border-white/10 rounded-xl py-2 text-center text-sm font-bold text-white focus:border-[#f3d8b6]/50 outline-none"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-white/80 align-middle">
                        € {it.unitPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right align-middle">
 <input
 type="number"
 min={0}
 step="0.5"
                          value={it.discountEur}
                          onChange={(e) =>
                            updateItem(idx, { discountEur: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="w-20 bg-black/40 border border-white/10 rounded-xl py-2 text-center text-sm font-bold text-red-300/90 focus:border-red-400/50 outline-none"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold text-[#f3d8b6] align-middle">
                        € {lineTotal.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => duplicateItem(idx)}
                            className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 text-white/60 hover:bg-white/10 hover:text-[#f3d8b6] transition-all"
 title="Duplica riga"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          </button>
                          <button
                            onClick={() => removeItem(idx)}
                            className="w-9 h-9 flex items-center justify-center rounded-xl border border-red-500/20 text-red-400/80 hover:bg-red-500/20 hover:text-red-300 transition-all"
 title="Elimina"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SUMMARY / PAYMENT PANEL */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-scz-dark">
        <div className="border-b border-white/[0.06] px-3 py-2.5 md:px-4">
          <h2 className="text-sm font-semibold text-white/85">Pagamento e conferma</h2>
        </div>

        <div className="p-3 md:p-4 space-y-4">
          {/* Riga totali: subtotale, sconto, totale */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:p-5">
              <div className="text-xs font-medium text-white/40">Subtotale</div>
              <div className="mt-1 text-xl font-extrabold text-white/90">€ {subtotal.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:p-5">
              <div className="text-xs font-medium text-white/40">Sconto cassa (€)</div>
 <input
 type="number"
 min={0}
 step="0.5"
                value={globalDiscountEur}
                onChange={(e) =>
                  setGlobalDiscountEur(Math.max(0, Number(e.target.value) || 0))
                }
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 font-bold text-white focus:border-[#f3d8b6]/50 outline-none"
 placeholder="0,00"
              />
              {globalDiscountEur > subtotal && (
                <p className="mt-1.5 text-[11px] font-medium text-amber-400/90">
                  Ridotto a € {globalDisc.toFixed(2)}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-[#f3d8b6]/30 bg-[#f3d8b6]/5 p-4 md:p-5">
              <div className="text-xs font-medium text-[#f3d8b6]/80">Totale da pagare</div>
              <div className="mt-1 text-xl md:text-2xl font-semibold text-[#f3d8b6]">€ {total.toFixed(2)}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 md:px-4">
            <span className="text-sm text-white/55">Stampante in chiusura</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                printerEnabled
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/15 text-amber-200"
              }`}
            >
              {cassa?.is_open
                ? printerEnabled
                  ? "Abilitata (sessione)"
                  : "Disabilitata (sessione)"
                : printerEnabled
                  ? "Predefinita: abilitata"
                  : "Predefinita: disabilitata"}
            </span>
            {cassa?.is_open ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-black/40"
                  checked={printerEnabled}
                  onChange={(e) => void setPrinterEnabledPersist(e.target.checked)}
                />
                Usa alla registrazione
              </label>
            ) : (
              <span className="text-xs text-white/45">
                Preferenza di stampa; non è lo stato cassa. Si conferma all’apertura.
              </span>
            )}
          </div>

          {/* Metodi di pagamento */}
          <div>
            <div className="text-xs font-medium text-white/40 mb-3">
              Metodo di pagamento
            </div>
            <div className="flex flex-wrap gap-3">
 <button
 type="button"
 onClick={() => setPaymentMethod("cash")}
                className={`min-w-[140px] py-4 px-6 rounded-xl font-bold text-sm border transition-all ${
                  paymentMethod === "cash"
                    ? "bg-[#f3d8b6] text-black border-[#f3d8b6] shadow-lg shadow-[#f3d8b6]/20"
                    : "bg-black/20 border-white/10 text-white/60 hover:bg-black/30 hover:text-white/80"
                }`}
              >
                <span className="block text-lg mb-0.5">💵</span>
 Contanti
 </button>
 <button
 type="button"
 onClick={() => setPaymentMethod("card")}
                className={`min-w-[140px] py-4 px-6 rounded-xl font-bold text-sm border transition-all ${
                  paymentMethod === "card"
                    ? "bg-[#f3d8b6] text-black border-[#f3d8b6] shadow-lg shadow-[#f3d8b6]/20"
                    : "bg-black/20 border-white/10 text-white/60 hover:bg-black/30 hover:text-white/80"
                }`}
              >
                <span className="block text-lg mb-0.5">💳</span>
                Carta / POS
              </button>
            </div>
          </div>

          {/* CTA + messaggio stato */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
 <button
 type="button"
              disabled={!canClose}
              onClick={handleClose}
              className={`flex-1 min-h-[56px] sm:min-h-[64px] rounded-2xl text-sm sm:text-base font-semibold transition-all flex items-center justify-center ${
                !canClose
                  ? "bg-black/20 text-white/30 cursor-not-allowed border border-white/10"
                  : "bg-[#f3d8b6] text-black border-2 border-[#f3d8b6] hover:opacity-95 active:scale-[0.99] shadow-[0_20px_40px_-12px_rgba(243,216,182,0.35)]"
              }`}
              title={
                closeBlockReason ??
                (cassa?.is_open
                  ? items.length
                    ? ""
                    : "Aggiungi almeno una riga"
                  : "Apri la cassa prima di procedere")
              }
            >
              {closing ? (
                <span className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-black" viewBox="0 0 24 24" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
 </svg>
 Elaborazione...
 </span>
 ) : cassa?.is_open ? (
 printerEnabled ? "Registra e stampa" : "Registra"
 ) : (
 "Apri cassa per chiudere"
              )}
            </button>
            {!canClose && (
              <p className="text-xs text-white/50 font-medium max-w-[280px]">
 {closeBlockReason ??
 (!cassa?.is_open
 ? "Apri la cassa dalla barra sopra per abilitare la chiusura."
 : items.length === 0
 ? "Aggiungi almeno una riga al riepilogo per chiudere."
                      : null)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
