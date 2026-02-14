// app/dashboard/cassa/[appointmentId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { toast } from "sonner";

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
  const [products, setProducts] = useState<any[]>([]);

  const [items, setItems] = useState<CashItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [globalDiscountEur, setGlobalDiscountEur] = useState(0);

  const [closing, setClosing] = useState(false);

  // Cassa status
  const [cassaLoading, setCassaLoading] = useState(false);
  const [cassa, setCassa] = useState<CassaStatusResponse | null>(null);

  // Open cassa UI
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [opening, setOpening] = useState(false);

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

      // Appuntamento (+ servizi prenotati)
      const { data: a, error: aErr } = await supabase
        .from("appointments")
        .select(
          `
          id, salon_id, customer_id, staff_id, status, sale_id,
          appointment_services (
            service:service_id ( id, name, price )
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

      // Cliente (se presente)
      let c = null;
      if (a.customer_id) {
        const { data: cd } = await supabase
          .from("customers")
          .select("first_name, last_name, phone")
          .eq("id", a.customer_id)
          .single();
        c = cd ?? null;
      }

      // Listini
      const [{ data: sv, error: svErr }, { data: pr, error: prErr }] =
        await Promise.all([
          supabase
            .from("services")
            .select("id, name, price, active")
            .eq("active", true),
          supabase
            .from("products")
            .select("id, name, price, active")
            .eq("active", true),
        ]);

      if (svErr || prErr) {
        // non blocco totale: possiamo comunque chiudere se i servizi prenotati sono già caricati
        console.error("Errore listini", svErr, prErr);
      }

      if (cancelled) return;

      setAppointment(a);
      setCustomer(c);
      setServices(sv || []);
      setProducts(pr || []);

      // Auto-popola dai servizi prenotati (se presenti)
      if (
        Array.isArray(a.appointment_services) &&
        a.appointment_services.length
      ) {
        const initialItems: CashItem[] = a.appointment_services
          .map((as: any) => as?.service)
          .filter(Boolean)
          .map((svc: any) => ({
            kind: "service",
            id: Number(svc.id),
            name: String(svc.name ?? "Servizio"),
            unitPrice: toNum(svc.price, 0),
            qty: 1,
            discountEur: 0,
          }));
        setItems(initialItems);
      } else {
        setItems([]);
      }

      // Status cassa
      const sid = Number(a.salon_id);
      if (Number.isFinite(sid) && sid > 0) {
        refreshCassaStatus(sid);
      } else {
        setCassa({
          ok: false,
          is_open: false,
          error: "salon_id appuntamento non valido",
        });
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [appointmentId, supabase]);

  /* =======================
     HANDLERS
  ======================= */

  function addItem(kind: "service" | "product", source: any) {
    setItems((prev) => {
      const id = Number(source?.id);
      if (!Number.isFinite(id) || id <= 0) return prev;

      // Prodotti: se già presente, aumenta qty
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

  const canClose =
    !closing &&
    !isNotInSala &&
    items.length > 0 &&
    Boolean(appointment?.id) &&
    Boolean(appointment?.salon_id) &&
    cassa?.is_open === true;

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
    const lines = items.map((it) => {
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
      if (!res.ok)
        throw new Error(data?.error || "Errore durante il salvataggio");

      toast.success("Vendita completata ✅");
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
    <div className="p-6 md:p-12 text-white max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {isNotInSala && (
        <div className="rounded-[2rem] border border-red-500/20 bg-red-500/10 p-6">
          <div className="text-[10px] uppercase tracking-[0.25em] font-black text-red-200/70">
            Accesso bloccato
          </div>
          <div className="mt-2 text-lg font-black text-red-100">
            Questo appuntamento non è “IN SALA”.
          </div>
          <div className="mt-1 text-sm text-red-200/70">
            Porta prima il cliente in sala dall’Agenda, poi rientra in Cassa.
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard/agenda"
              className="h-11 px-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] bg-[#f3d8b6] text-black hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center"
            >
              ← Torna in Agenda
            </Link>

            <Link
              href="/dashboard/in-sala"
              className="h-11 px-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] bg-white/5 text-white/60 hover:bg-white/10 inline-flex items-center justify-center"
            >
              Vai a In Sala
            </Link>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div>
          <Link
            href="/dashboard/agenda"
            className="text-[10px] text-white/40 hover:text-[#f3d8b6] transition uppercase tracking-[0.2em] mb-2 block font-bold"
          >
            ← Torna all'Agenda
          </Link>
          <h1 className="text-5xl font-black text-[#f3d8b6] tracking-tight">
            Check-out
          </h1>
          <p className="text-white/50 mt-1 text-sm">
            Cliente:{" "}
            <span className="text-[#f3d8b6] font-bold uppercase">
              {customerLabel}
            </span>
          </p>
          <p className="text-white/30 mt-1 text-xs uppercase tracking-widest font-black">
            Salone:{" "}
            <span className="text-white/70">
              {salonName ?? `#${appointment?.salon_id}`}
            </span>
          </p>
        </div>

        <div className="bg-[#1c0f0a] border border-[#5c3a21]/50 rounded-[2rem] p-8 shadow-2xl min-w-[280px] text-right ring-1 ring-white/5">
          <div className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-1">
            Totale da Pagare
          </div>
          <div className="text-5xl font-black text-[#f3d8b6]">
            € {total.toFixed(2)}
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.2em] font-black">
            <span className="text-white/30">Subtotale:</span>{" "}
            <span className="text-white/70">€ {subtotal.toFixed(2)}</span>
            <span className="mx-2 text-white/20">•</span>
            <span className="text-white/30">Sconto:</span>{" "}
            <span className="text-white/70">€ {globalDisc.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* CASSA STATUS BAR */}
      <div className="rounded-[2rem] border border-white/5 bg-white/[0.03] backdrop-blur-sm p-6 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.25em] font-black text-white/40">
            Stato Cassa
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-[10px] uppercase font-black tracking-widest ${
                cassaLoading
                  ? "bg-white/5 text-white/40"
                  : cassa?.is_open
                    ? "bg-green-500/15 text-green-300"
                    : "bg-red-500/15 text-red-300"
              }`}
            >
              {cassaLoading
                ? "Verifica..."
                : cassa?.is_open
                  ? "Aperta"
                  : "Chiusa"}
            </span>
            <span className="text-white/30 text-xs">
              {cassa?.is_open
                ? "Puoi chiudere la vendita."
                : "Devi aprire la cassa prima di procedere."}
            </span>
          </div>
          {cassa?.error ? (
            <div className="text-red-300/80 text-xs">{cassa.error}</div>
          ) : null}
        </div>

        {!cassa?.is_open && (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest font-black text-white/40">
                Fondo cassa €
              </div>
              <input
                type="number"
                min={0}
                step="5"
                value={openingCash}
                onChange={(e) =>
                  setOpeningCash(Math.max(0, Number(e.target.value) || 0))
                }
                className="w-28 bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-sm font-bold focus:border-[#f3d8b6]/50 outline-none"
              />
            </div>
            <button
              onClick={handleOpenCassa}
              disabled={opening}
              className={`h-11 px-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all ${
                opening
                  ? "bg-white/5 text-white/25 cursor-not-allowed border border-white/5"
                  : "bg-[#f3d8b6] text-black hover:scale-[1.02] active:scale-[0.98]"
              }`}
            >
              {opening ? "Apertura..." : "Apri cassa"}
            </button>
          </div>
        )}

        {cassa?.is_open && (
          <button
            onClick={async () => {
              await refreshCassaStatus(Number(appointment?.salon_id));
              toast.message("Stato cassa aggiornato");
            }}
            className="h-11 px-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all bg-white/5 text-white/50 hover:bg-white/10"
          >
            Aggiorna
          </button>
        )}
      </div>

      {/* SELECTION GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] text-white/30 uppercase ml-4 font-black tracking-widest">
            Aggiungi Servizi
          </label>
          <select
            className="w-full bg-[#1c0f0a] border border-[#5c3a21]/30 rounded-2xl p-4 text-white/80 focus:ring-2 ring-[#f3d8b6]/20 outline-none appearance-none cursor-pointer hover:border-[#f3d8b6]/30 transition-colors"
            onChange={(e) => {
              const s = services.find((x) => x.id === Number(e.target.value));
              if (s) addItem("service", s);
              e.target.value = "";
            }}
          >
            <option value="">+ Aggiungi un servizio...</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — €{s.price}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] text-white/30 uppercase ml-4 font-black tracking-widest">
            Aggiungi Prodotti
          </label>
          <select
            className="w-full bg-[#1c0f0a] border border-[#5c3a21]/30 rounded-2xl p-4 text-white/80 focus:ring-2 ring-[#f3d8b6]/20 outline-none appearance-none cursor-pointer hover:border-[#f3d8b6]/30 transition-colors"
            onChange={(e) => {
              const p = products.find((x) => x.id === Number(e.target.value));
              if (p) addItem("product", p);
              e.target.value = "";
            }}
          >
            <option value="">+ Vendita Prodotto...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — €{p.price}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ITEMS LIST */}
      <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] overflow-hidden backdrop-blur-sm">
        <div className="p-6 border-b border-white/5 bg-white/5 text-[10px] uppercase font-black tracking-widest text-white/40 flex justify-between items-center">
          <span>Riepilogo Prestazioni e Vendite</span>
          <span className="bg-[#f3d8b6]/10 text-[#f3d8b6] px-3 py-1 rounded-full">
            {items.length} voci
          </span>
        </div>

        <div className="p-6 space-y-4 max-h-[450px] overflow-y-auto custom-scrollbar">
          {items.map((it, idx) => {
            const gross = it.unitPrice * it.qty;
            const disc = Math.min(it.discountEur, gross);
            const lineTotal = Math.max(0, gross - disc);

            return (
              <div
                key={`${it.kind}-${it.id}-${idx}`}
                className="flex flex-wrap md:flex-nowrap items-center gap-4 bg-[#2a1a14]/40 border border-white/5 rounded-[1.5rem] p-5 shadow-sm group hover:border-[#f3d8b6]/20 transition-all"
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[8px] uppercase px-2 py-0.5 rounded-md font-bold ${
                        it.kind === "service"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-green-500/20 text-green-400"
                      }`}
                    >
                      {it.kind === "service" ? "Servizio" : "Prodotto"}
                    </span>
                    <div className="font-bold text-[#f3d8b6] text-lg">
                      {it.name}
                    </div>
                  </div>
                  <div className="text-[11px] text-white/30 font-mono mt-1 uppercase tracking-tight">
                    Prezzo base: €{it.unitPrice.toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-[9px] text-white/30 uppercase font-black">
                      Qtà
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={it.qty}
                      onChange={(e) =>
                        updateItem(idx, {
                          qty: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="w-14 bg-black/40 border border-white/10 rounded-xl py-2 text-center text-sm font-bold focus:border-[#f3d8b6]/50 outline-none"
                    />
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <div className="text-[9px] text-white/30 uppercase font-black">
                      Sconto €
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={it.discountEur}
                      onChange={(e) =>
                        updateItem(idx, {
                          discountEur: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-20 bg-black/40 border border-white/10 rounded-xl py-2 text-center text-sm font-bold focus:border-[#f3d8b6]/50 outline-none text-red-400"
                    />
                  </div>

                  <div className="w-28 text-right flex flex-col">
                    <span className="text-[9px] text-white/30 uppercase font-black">
                      Totale Riga
                    </span>
                    <span className="text-xl font-black text-white/90">
                      € {lineTotal.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={() => removeItem(idx)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    title="Rimuovi"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="py-20 text-center space-y-4">
              <div className="text-5xl opacity-20">🛒</div>
              <div className="text-white/20 italic tracking-widest uppercase text-sm font-medium">
                La cassa è vuota
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER CONTROLS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end bg-[#1c0f0a]/50 p-8 rounded-[2.5rem] border border-white/5 shadow-inner">
        <div className="space-y-3">
          <label className="text-[10px] text-white/30 uppercase ml-4 font-black tracking-widest">
            Metodo di Pagamento
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPaymentMethod("cash")}
              className={`py-4 rounded-2xl font-bold transition-all ${
                paymentMethod === "cash"
                  ? "bg-[#f3d8b6] text-black shadow-lg shadow-[#f3d8b6]/20"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              💵 Contanti
            </button>
            <button
              onClick={() => setPaymentMethod("card")}
              className={`py-4 rounded-2xl font-bold transition-all ${
                paymentMethod === "card"
                  ? "bg-[#f3d8b6] text-black shadow-lg shadow-[#f3d8b6]/20"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              💳 Carta/POS
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] text-white/30 uppercase ml-4 font-black tracking-widest">
            Sconto Totale alla Cassa (€)
          </label>
          <input
            type="number"
            min={0}
            step="1"
            value={globalDiscountEur}
            onChange={(e) =>
              setGlobalDiscountEur(Math.max(0, Number(e.target.value) || 0))
            }
            className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 font-bold text-red-400 text-lg focus:border-red-500/50 outline-none transition-all"
            placeholder="0.00"
          />
          {globalDiscountEur > subtotal ? (
            <div className="text-[10px] uppercase tracking-widest font-black text-red-300/70 ml-4">
              Sconto ridotto a € {globalDisc.toFixed(2)} (non può superare il
              subtotale)
            </div>
          ) : null}
        </div>

        <button
          disabled={!canClose}
          onClick={handleClose}
          className={`h-[70px] rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-sm transition-all
            ${
              !canClose
                ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                : "bg-[#f3d8b6] text-black hover:scale-[1.02] active:scale-[0.98] shadow-[0_20px_40px_-15px_rgba(243,216,182,0.3)] hover:shadow-[#f3d8b6]/40"
            }`}
          title={
            cassa?.is_open
              ? items.length
                ? ""
                : "Aggiungi almeno una riga"
              : "Apri la cassa prima di procedere"
          }
        >
          {closing ? (
            <span className="flex items-center justify-center gap-3">
              <svg
                className="animate-spin h-5 w-5 text-black"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Elaborazione...
            </span>
          ) : cassa?.is_open ? (
            "Conferma e Chiudi"
          ) : (
            "Apri cassa per chiudere"
          )}
        </button>
      </div>
    </div>
  );
}
