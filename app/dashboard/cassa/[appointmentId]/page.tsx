"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";

/* =======================
    TYPES
======================= */

type CashItem = {
  kind: "service" | "product";
  id: number;
  name: string;
  unitPrice: number;
  qty: number;
  discountEur: number;
};

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
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [globalDiscountEur, setGlobalDiscountEur] = useState(0);

  const [closing, setClosing] = useState(false);

  /* =======================
      LOAD DATA & AUTO-FILL
  ======================= */

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

      // Carichiamo appuntamento + servizi inclusi
      const { data: a, error: aErr } = await supabase
        .from("appointments")
        .select(`
          id, salon_id, customer_id, staff_id, status,
          appointment_services (
            service:service_id ( id, name, price )
          )
        `)
        .eq("id", appointmentId)
        .single();

      if (aErr || !a) {
        setError("Appuntamento non trovato");
        setLoading(false);
        return;
      }

      let c = null;
      if (a.customer_id) {
        const { data: cd } = await supabase
          .from("customers")
          .select("first_name, last_name, phone")
          .eq("id", a.customer_id)
          .single();
        c = cd;
      }

      const [{ data: sv }, { data: pr }] = await Promise.all([
        supabase.from("services").select("id, name, price").eq("active", true),
        supabase.from("products").select("id, name, price").eq("active", true),
      ]);

      if (!cancelled) {
        setAppointment(a);
        setCustomer(c);
        setServices(sv || []);
        setProducts(pr || []);

        // AUTO-POPOLAMENTO DAI SERVIZI PRENOTATI
        if (a.appointment_services) {
          const initialItems: CashItem[] = a.appointment_services.map((as: any) => ({
            kind: "service",
            id: as.service.id,
            name: as.service.name,
            unitPrice: Number(as.service.price || 0),
            qty: 1,
            discountEur: 0,
          }));
          setItems(initialItems);
        }

        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [appointmentId, supabase]);

  /* =======================
      HANDLERS (LOGICA SMART)
  ======================= */

  function addItem(kind: "service" | "product", source: any) {
    setItems((prev) => {
      // Se è un prodotto, verifichiamo se è già in lista per aumentare la Qty
      const existingIdx = prev.findIndex(it => it.kind === kind && it.id === source.id);
      
      if (existingIdx > -1 && kind === "product") {
        return prev.map((it, i) => 
          i === existingIdx ? { ...it, qty: it.qty + 1 } : it
        );
      }
      
      // Altrimenti aggiungiamo una nuova riga
      return [
        ...prev,
        {
          kind,
          id: Number(source.id),
          name: source.name,
          unitPrice: Number(source.price ?? 0),
          qty: 1,
          discountEur: 0,
        },
      ];
    });
  }

  function updateItem(idx: number, patch: Partial<CashItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  /* =======================
      TOTALI
  ======================= */
  const subtotal = items.reduce((s, i) => s + (i.unitPrice * i.qty - i.discountEur), 0);
  const total = Math.max(0, subtotal - globalDiscountEur);

  async function handleClose() {
    if (closing || items.length === 0) return;
    setClosing(true);

    // Trasformiamo gli sconti fissi (€) in percentuali (%) per l'API (come richiesto dal backend)
    const lines = items.map((it) => {
      const gross = it.unitPrice * it.qty;
      const discountPct = gross > 0 ? (it.discountEur / gross) * 100 : 0;
      return {
        kind: it.kind,
        id: it.id,
        qty: it.qty,
        discount: Number(discountPct.toFixed(4)),
      };
    });

    const globalDiscountPct = subtotal > 0 ? (globalDiscountEur / subtotal) * 100 : 0;

    try {
      const res = await fetch("/api/cassa/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: appointment.id,
          payment_method: paymentMethod,
          global_discount: Number(globalDiscountPct.toFixed(4)),
          lines,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore durante il salvataggio");

      alert(`Vendita completata con successo!`);
      router.push("/dashboard/agenda"); 
    } catch (err: any) {
      alert("ERRORE: " + err.message);
      setClosing(false);
    }
  }

  /* =======================
      UI
  ======================= */

  if (loading) return <div className="p-8 text-[#f3d8b6] animate-pulse font-bold">Inizializzazione check-out...</div>;
  if (error) return <div className="p-8 text-red-400 bg-red-500/10 rounded-2xl m-6 border border-red-500/20">{error}</div>;

  return (
    <div className="p-6 md:p-12 text-white max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div>
          <Link href="/dashboard/agenda" className="text-[10px] text-white/40 hover:text-[#f3d8b6] transition uppercase tracking-[0.2em] mb-2 block font-bold">
            ← Torna all'Agenda
          </Link>
          <h1 className="text-5xl font-black text-[#f3d8b6] tracking-tight">Check-out</h1>
          <p className="text-white/50 mt-1 text-sm">
            Cliente: <span className="text-[#f3d8b6] font-bold uppercase">{customer ? `${customer.first_name} ${customer.last_name}` : "Cliente Occasionale"}</span>
          </p>
        </div>

        <div className="bg-[#1c0f0a] border border-[#5c3a21]/50 rounded-[2rem] p-8 shadow-2xl min-w-[280px] text-right ring-1 ring-white/5">
          <div className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-1">Totale da Pagare</div>
          <div className="text-5xl font-black text-[#f3d8b6]">€ {total.toFixed(2)}</div>
        </div>
      </div>

      {/* SELECTION GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] text-white/30 uppercase ml-4 font-black tracking-widest">Aggiungi Servizi</label>
          <select
            className="w-full bg-[#1c0f0a] border border-[#5c3a21]/30 rounded-2xl p-4 text-white/80 focus:ring-2 ring-[#f3d8b6]/20 outline-none appearance-none cursor-pointer hover:border-[#f3d8b6]/30 transition-colors"
            onChange={(e) => {
              const s = services.find(x => x.id === Number(e.target.value));
              if (s) addItem("service", s);
              e.target.value = "";
            }}
          >
            <option value="">+ Aggiungi un servizio...</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name} — €{s.price}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] text-white/30 uppercase ml-4 font-black tracking-widest">Aggiungi Prodotti</label>
          <select
            className="w-full bg-[#1c0f0a] border border-[#5c3a21]/30 rounded-2xl p-4 text-white/80 focus:ring-2 ring-[#f3d8b6]/20 outline-none appearance-none cursor-pointer hover:border-[#f3d8b6]/30 transition-colors"
            onChange={(e) => {
              const p = products.find(x => x.id === Number(e.target.value));
              if (p) addItem("product", p);
              e.target.value = "";
            }}
          >
            <option value="">+ Vendita Prodotto...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} — €{p.price}</option>)}
          </select>
        </div>
      </div>

      {/* ITEMS LIST */}
      <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] overflow-hidden backdrop-blur-sm">
        <div className="p-6 border-b border-white/5 bg-white/5 text-[10px] uppercase font-black tracking-widest text-white/40 flex justify-between items-center">
          <span>Riepilogo Prestazioni e Vendite</span>
          <span className="bg-[#f3d8b6]/10 text-[#f3d8b6] px-3 py-1 rounded-full">{items.length} voci</span>
        </div>
        <div className="p-6 space-y-4 max-h-[450px] overflow-y-auto custom-scrollbar">
          {items.map((it, idx) => (
            <div key={`${it.kind}-${it.id}-${idx}`} className="flex flex-wrap md:flex-nowrap items-center gap-4 bg-[#2a1a14]/40 border border-white/5 rounded-[1.5rem] p-5 shadow-sm group hover:border-[#f3d8b6]/20 transition-all">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <span className={`text-[8px] uppercase px-2 py-0.5 rounded-md font-bold ${it.kind === 'service' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                    {it.kind === 'service' ? 'Servizio' : 'Prodotto'}
                  </span>
                  <div className="font-bold text-[#f3d8b6] text-lg">{it.name}</div>
                </div>
                <div className="text-[11px] text-white/30 font-mono mt-1 uppercase tracking-tight">Prezzo base: €{it.unitPrice.toFixed(2)}</div>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-center gap-1">
                  <div className="text-[9px] text-white/30 uppercase font-black">Qtà</div>
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) => updateItem(idx, { qty: Math.max(1, +e.target.value) })}
                    className="w-14 bg-black/40 border border-white/10 rounded-xl py-2 text-center text-sm font-bold focus:border-[#f3d8b6]/50 outline-none"
                  />
                </div>

                <div className="flex flex-col items-center gap-1">
                  <div className="text-[9px] text-white/30 uppercase font-black">Sconto €</div>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={it.discountEur}
                    onChange={(e) => updateItem(idx, { discountEur: Math.max(0, +e.target.value) })}
                    className="w-20 bg-black/40 border border-white/10 rounded-xl py-2 text-center text-sm font-bold focus:border-[#f3d8b6]/50 outline-none text-red-400"
                  />
                </div>

                <div className="w-28 text-right flex flex-col">
                  <span className="text-[9px] text-white/30 uppercase font-black">Totale Riga</span>
                  <span className="text-xl font-black text-white/90">
                    € {(it.unitPrice * it.qty - it.discountEur).toFixed(2)}
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
          ))}
          {items.length === 0 && (
            <div className="py-20 text-center space-y-4">
               <div className="text-5xl opacity-20">🛒</div>
               <div className="text-white/20 italic tracking-widest uppercase text-sm font-medium">La cassa è vuota</div>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER CONTROLS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end bg-[#1c0f0a]/50 p-8 rounded-[2.5rem] border border-white/5 shadow-inner">
        <div className="space-y-3">
          <label className="text-[10px] text-white/30 uppercase ml-4 font-black tracking-widest">Metodo di Pagamento</label>
          <div className="grid grid-cols-2 gap-2">
             <button 
                onClick={() => setPaymentMethod("cash")}
                className={`py-4 rounded-2xl font-bold transition-all ${paymentMethod === "cash" ? "bg-[#f3d8b6] text-black shadow-lg shadow-[#f3d8b6]/20" : "bg-white/5 text-white/40 hover:bg-white/10"}`}
             >
               💵 Contanti
             </button>
             <button 
                onClick={() => setPaymentMethod("card")}
                className={`py-4 rounded-2xl font-bold transition-all ${paymentMethod === "card" ? "bg-[#f3d8b6] text-black shadow-lg shadow-[#f3d8b6]/20" : "bg-white/5 text-white/40 hover:bg-white/10"}`}
             >
               💳 Carta/POS
             </button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] text-white/30 uppercase ml-4 font-black tracking-widest">Sconto Totale alla Cassa (€)</label>
          <input
            type="number"
            min={0}
            step="1"
            value={globalDiscountEur}
            onChange={(e) => setGlobalDiscountEur(Math.max(0, +e.target.value))}
            className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 font-bold text-red-400 text-lg focus:border-red-500/50 outline-none transition-all"
            placeholder="0.00"
          />
        </div>

        <button
          disabled={closing || items.length === 0}
          onClick={handleClose}
          className={`h-[70px] rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-sm transition-all
            ${closing || items.length === 0
              ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
              : "bg-[#f3d8b6] text-black hover:scale-[1.02] active:scale-[0.98] shadow-[0_20px_40px_-15px_rgba(243,216,182,0.3)] hover:shadow-[#f3d8b6]/40"
            }`}
        >
          {closing ? (
             <span className="flex items-center justify-center gap-3">
                <svg className="animate-spin h-5 w-5 text-black" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Elaborazione...
             </span>
          ) : "Conferma e Chiudi"}
        </button>
      </div>
    </div>
  );
}