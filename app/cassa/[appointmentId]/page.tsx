"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

/* =======================
   TYPES
======================= */

type CashItem = {
  kind: "service" | "product";
  id: number;
  name: string;
  unitPrice: number;
  qty: number;
  discountEur: number; // € (UX)
};

/* =======================
   PAGE
======================= */

export default function CassaPage() {
  const supabase = useMemo(() => createClient(), []);
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
     LOAD DATA
  ======================= */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      if (!Number.isFinite(appointmentId)) {
        setError("appointmentId non valido");
        setLoading(false);
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        setError("Non sei autenticato");
        setLoading(false);
        return;
      }

      const { data: a, error: aErr } = await supabase
        .from("appointments")
        .select("id, salon_id, customer_id, staff_id, status")
        .eq("id", appointmentId)
        .single();

      if (aErr) {
        setError(aErr.message);
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
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [appointmentId, supabase]);

  /* =======================
     ITEMS HANDLING
  ======================= */

  function addItem(kind: "service" | "product", source: any) {
    setItems((prev) => [
      ...prev,
      {
        kind,
        id: Number(source.id),
        name: source.name,
        unitPrice: Number(source.price ?? 0),
        qty: 1,
        discountEur: 0,
      },
    ]);
  }

  function updateItem(idx: number, patch: Partial<CashItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  /* =======================
     TOTALS
  ======================= */

  const subtotal = items.reduce(
    (s, i) => s + i.unitPrice * i.qty - i.discountEur,
    0
  );

  const total = Math.max(0, subtotal - globalDiscountEur);

  /* =======================
     CLOSE
  ======================= */

  async function handleClose() {
    if (closing || items.length === 0) return;

    setClosing(true);

    const lines = items.map((it) => {
      const gross = it.unitPrice * it.qty;
      const discountPct = gross > 0 ? (it.discountEur / gross) * 100 : 0;

      return {
        kind: it.kind,
        id: it.id,
        qty: it.qty,
        discount: Number(discountPct.toFixed(4)), // %
      };
    });

    const globalDiscountPct =
      subtotal > 0 ? (globalDiscountEur / subtotal) * 100 : 0;

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

    if (!res.ok) {
      const j = await res.json().catch(() => null);
      alert(j?.error || "Errore chiusura");
      setClosing(false);
      return;
    }

    const j = await res.json();
    alert(`Vendita salvata ✅ (ID ${j.sale_id})`);
    setClosing(false);
  }

  /* =======================
     UI
  ======================= */

  if (loading) {
    return <div className="p-8 text-white/70">Caricamento cassa…</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-red-300 bg-red-500/10 rounded-2xl">
        {error}
      </div>
    );
  }

  return (
    <div className="p-8 text-white space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold">Cassa</h1>
          <p className="text-white/60 mt-1">
            Appuntamento #{appointment.id} —{" "}
            {customer
              ? `${customer.first_name} ${customer.last_name}`
              : "Cliente"}
          </p>
        </div>

        <div className="bg-[#1c0f0a] border border-[#9b6b43]/30 rounded-2xl px-6 py-4">
          <div className="text-xs text-white/60">Totale</div>
          <div className="text-2xl font-semibold">€ {total.toFixed(2)}</div>
        </div>
      </div>

      {/* ADD */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <select
          className="bg-[#1c0f0a] border border-[#9b6b43]/30 rounded-xl p-4"
          defaultValue=""
          onChange={(e) => {
            const s = services.find((x) => x.id === Number(e.target.value));
            if (s) addItem("service", s);
            e.currentTarget.value = "";
          }}
        >
          <option value="">+ Servizio</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — € {Number(s.price).toFixed(2)}
            </option>
          ))}
        </select>

        <select
          className="bg-[#1c0f0a] border border-[#9b6b43]/30 rounded-xl p-4"
          defaultValue=""
          onChange={(e) => {
            const p = products.find((x) => x.id === Number(e.target.value));
            if (p) addItem("product", p);
            e.currentTarget.value = "";
          }}
        >
          <option value="">+ Prodotto</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — € {Number(p.price).toFixed(2)}
            </option>
          ))}
        </select>
      </div>

      {/* ITEMS */}
      <div className="bg-[#1c0f0a] border border-[#9b6b43]/30 rounded-2xl p-4 space-y-3">
        {items.length === 0 && (
          <div className="text-white/50">Nessuna riga inserita</div>
        )}

        {items.map((it, idx) => (
          <div
            key={idx}
            className="flex flex-wrap items-center gap-3 bg-[#3a251a] rounded-xl p-3"
          >
            <div className="flex-1">
              <div className="font-semibold">{it.name}</div>
              <div className="text-sm text-white/60">
                € {it.unitPrice.toFixed(2)}
              </div>
            </div>

            <input
              type="number"
              min={1}
              value={it.qty}
              onChange={(e) =>
                updateItem(idx, { qty: Math.max(1, +e.target.value) })
              }
              className="w-20 bg-[#1c0f0a] rounded-lg p-2"
            />

            <input
              type="number"
              min={0}
              value={it.discountEur}
              onChange={(e) =>
                updateItem(idx, { discountEur: Math.max(0, +e.target.value) })
              }
              className="w-24 bg-[#1c0f0a] rounded-lg p-2"
            />

            <div className="w-24 text-right font-semibold">
              € {(it.unitPrice * it.qty - it.discountEur).toFixed(2)}
            </div>

            <button
              onClick={() => removeItem(idx)}
              className="px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-600"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <select
          className="bg-[#1c0f0a] border border-[#9b6b43]/30 rounded-xl p-4"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as any)}
        >
          <option value="cash">Contanti</option>
          <option value="card">Carta</option>
        </select>

        <input
          type="number"
          min={0}
          value={globalDiscountEur}
          onChange={(e) => setGlobalDiscountEur(Math.max(0, +e.target.value))}
          className="bg-[#1c0f0a] border border-[#9b6b43]/30 rounded-xl p-4"
          placeholder="Sconto totale €"
        />

        <button
          disabled={closing || items.length === 0}
          onClick={handleClose}
          className={`rounded-xl p-4 font-semibold text-[#1c0f0a]
            ${
              closing || items.length === 0
                ? "bg-[#d8a471]/40 cursor-not-allowed"
                : "bg-[#d8a471] hover:brightness-110"
            }`}
        >
          {closing ? "Salvataggio…" : "Chiudi e salva"}
        </button>
      </div>
    </div>
  );
}
