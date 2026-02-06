"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

type CashItem = {
  kind: "service" | "product";
  id: number;
  name: string;
  unitPrice: number; // prezzo unitario
  qty: number;
  discount: number; // sconto in €
};

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
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);

  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError("");

      if (!Number.isFinite(appointmentId)) {
        setError("appointmentId non valido.");
        setLoading(false);
        return;
      }

      // 1) auth (per capire se sei loggato veramente)
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        if (!cancelled) setError("Auth error: " + authErr.message);
        setLoading(false);
        return;
      }
      if (!authData?.user) {
        if (!cancelled) setError("Non sei loggato (auth.getUser() = null).");
        setLoading(false);
        return;
      }

      // 2) carico appuntamento
      const { data: a, error: aErr } = await supabase
        .from("appointments")
        .select(
          `
          id,
          salon_id,
          customer_id,
          staff_id,
          start_time,
          end_time,
          status,
          notes
        `
        )
        .eq("id", appointmentId)
        .single();

      if (aErr) {
        if (!cancelled) setError("Errore load appointment: " + aErr.message);
        setLoading(false);
        return;
      }

      // 2b) carico cliente (se c’è)
      let c: any = null;

      if (a?.customer_id) {
        const { data: cData, error: cErr } = await supabase
          .from("customers")
          .select("id, first_name, last_name, phone")
          .eq("id", a.customer_id)
          .single();

        if (cErr) {
          if (!cancelled) setError("Errore load customer: " + cErr.message);
          setLoading(false);
          return;
        }
        c = cData;
      } else {
        // customer mancante: non bloccare la cassa
        c = {
          id: null,
          first_name: "Cliente",
          last_name: "(non assegnato)",
          phone: null,
        };
      }

      // 3) carico listini (servizi + prodotti)
      const [{ data: sv, error: svErr }, { data: pr, error: prErr }] =
        await Promise.all([
          supabase
            .from("services")
            .select("id, name, price, vat_rate, active")
            .eq("active", true)
            .order("name"),
          supabase
            .from("products")
            .select("id, name, price, vat_rate, active")
            .eq("active", true)
            .order("name"),
        ]);

      if (svErr) {
        if (!cancelled) setError("Errore load services: " + svErr.message);
        setLoading(false);
        return;
      }
      if (prErr) {
        if (!cancelled) setError("Errore load products: " + prErr.message);
        setLoading(false);
        return;
      }

      if (!cancelled) {
        setAppointment(a);
        setCustomer(c);
        setServices(sv || []);
        setProducts(pr || []);
        setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [appointmentId, supabase]);

  function addService(serviceId: number) {
    const s = services.find((x) => Number(x.id) === Number(serviceId));
    if (!s) return;

    setItems((prev) => [
      ...prev,
      {
        kind: "service",
        id: Number(s.id),
        name: String(s.name),
        unitPrice: Number(s.price ?? 0),
        qty: 1,
        discount: 0,
      },
    ]);
  }

  function addProduct(productId: number) {
    const p = products.find((x) => Number(x.id) === Number(productId));
    if (!p) return;

    setItems((prev) => [
      ...prev,
      {
        kind: "product",
        id: Number(p.id),
        name: String(p.name),
        unitPrice: Number(p.price ?? 0),
        qty: 1,
        discount: 0,
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

  const subtotal = items.reduce(
    (sum, it) => sum + it.unitPrice * it.qty - it.discount,
    0
  );
  const total = Math.max(0, subtotal - globalDiscount);

  async function handleClose() {
    if (!appointment?.id) return;
    if (closing) return;

    if (items.length === 0) {
      alert("Aggiungi almeno una riga.");
      return;
    }

    setClosing(true);

    const body = {
      appointment_id: Number(appointment.id),
      payment_method: paymentMethod,
      global_discount: Number(globalDiscount || 0),
      lines: items.map((it) => ({
        kind: it.kind,
        id: Number(it.id),
        qty: Math.max(1, Number(it.qty || 1)),
        discount: Math.max(0, Number(it.discount || 0)),
        unit_price: Math.max(0, Number(it.unitPrice || 0)),
      })),
    };

    const res = await fetch("/api/cassa/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => null);
      alert("Errore chiusura: " + (j?.error || res.statusText));
      setClosing(false);
      return;
    }

    const j = await res.json().catch(() => null);
    alert("OK ✅ vendita salvata (id: " + (j?.sale_id ?? "n/a") + ")");
    setClosing(false);
  }

  if (loading) {
    return (
      <div className="p-6 text-white">
        <div className="text-xl font-semibold">Cassa</div>
        <div className="text-white/70 mt-2">Caricamento…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-white">
        <div className="text-xl font-semibold">Cassa</div>
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="font-semibold text-red-200">Errore</div>
          <div className="text-red-100/80 mt-1 whitespace-pre-wrap">
            {error}
          </div>
          <div className="text-white/60 mt-3 text-sm">
            Apri DevTools → Console/Network e guarda se c’è un 401/403 su
            appointments/customers.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">Cassa</div>
          <div className="text-white/70 mt-1">
            Appuntamento #{appointment?.id} — {customer?.first_name}{" "}
            {customer?.last_name}
          </div>
        </div>

        <div className="rounded-xl border border-[#9b6b43]/30 bg-[#1c0f0a] px-4 py-2">
          <div className="text-xs text-white/60">Totale</div>
          <div className="text-xl font-semibold">€ {total.toFixed(2)}</div>
        </div>
      </div>

      {/* PICKER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="rounded-2xl border border-[#9b6b43]/30 bg-[#1c0f0a] p-4">
          <div className="font-semibold mb-3">Aggiungi Servizio</div>
          <select
            className="w-full bg-[#3a251a] rounded-xl p-3"
            defaultValue=""
            onChange={(e) => {
              const id = Number(e.target.value);
              if (Number.isFinite(id) && id > 0) addService(id);
              e.currentTarget.value = "";
            }}
          >
            <option value="">Seleziona…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — € {Number(s.price ?? 0).toFixed(2)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-[#9b6b43]/30 bg-[#1c0f0a] p-4">
          <div className="font-semibold mb-3">Aggiungi Prodotto</div>
          <select
            className="w-full bg-[#3a251a] rounded-xl p-3"
            defaultValue=""
            onChange={(e) => {
              const id = Number(e.target.value);
              if (Number.isFinite(id) && id > 0) addProduct(id);
              e.currentTarget.value = "";
            }}
          >
            <option value="">Seleziona…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — € {Number(p.price ?? 0).toFixed(2)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ITEMS */}
      <div className="rounded-2xl border border-[#9b6b43]/30 bg-[#1c0f0a] p-4 mt-6">
        <div className="font-semibold mb-3">Righe</div>

        {items.length === 0 ? (
          <div className="text-white/60">Nessuna riga aggiunta.</div>
        ) : (
          <div className="space-y-3">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="flex flex-col lg:flex-row lg:items-center gap-3 rounded-xl bg-[#3a251a] p-3"
              >
                <div className="flex-1">
                  <div className="font-semibold">
                    {it.kind === "service" ? "Servizio" : "Prodotto"} — {it.name}
                  </div>
                  <div className="text-white/70 text-sm">
                    € {it.unitPrice.toFixed(2)} /{" "}
                    {it.kind === "service" ? "cad" : "pz"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-white/70 text-sm">Q.tà</label>
                  <input
                    type="number"
                    min={1}
                    className="w-20 bg-[#1c0f0a] rounded-lg p-2"
                    value={it.qty}
                    onChange={(e) =>
                      updateItem(idx, {
                        qty: Math.max(1, Number(e.target.value || 1)),
                      })
                    }
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-white/70 text-sm">Sconto €</label>
                  <input
                    type="number"
                    min={0}
                    className="w-24 bg-[#1c0f0a] rounded-lg p-2"
                    value={it.discount}
                    onChange={(e) =>
                      updateItem(idx, {
                        discount: Math.max(0, Number(e.target.value || 0)),
                      })
                    }
                  />
                </div>

                <div className="w-28 text-right font-semibold">
                  € {(it.unitPrice * it.qty - it.discount).toFixed(2)}
                </div>

                <button
                  className="px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-600"
                  onClick={() => removeItem(idx)}
                >
                  X
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CHECKOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="rounded-2xl border border-[#9b6b43]/30 bg-[#1c0f0a] p-4">
          <div className="font-semibold mb-2">Pagamento</div>
          <select
            className="w-full bg-[#3a251a] rounded-xl p-3"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as any)}
          >
            <option value="cash">Contanti</option>
            <option value="card">Carta</option>
          </select>
        </div>

        <div className="rounded-2xl border border-[#9b6b43]/30 bg-[#1c0f0a] p-4">
          <div className="font-semibold mb-2">Sconto totale €</div>
          <input
            type="number"
            min={0}
            className="w-full bg-[#3a251a] rounded-xl p-3"
            value={globalDiscount}
            onChange={(e) =>
              setGlobalDiscount(Math.max(0, Number(e.target.value || 0)))
            }
          />
        </div>

        <div className="rounded-2xl border border-[#9b6b43]/30 bg-[#1c0f0a] p-4">
          <div className="text-white/70 text-sm">Da pagare</div>
          <div className="text-2xl font-semibold">€ {total.toFixed(2)}</div>

          <button
            onClick={handleClose}
            disabled={items.length === 0 || closing}
            className={`mt-3 w-full rounded-xl p-3 font-semibold text-[#1c0f0a]
              ${
                items.length === 0 || closing
                  ? "bg-[#d8a471]/40 cursor-not-allowed"
                  : "bg-[#d8a471] hover:brightness-110"
              }`}
          >
            {closing ? "Salvataggio..." : "Chiudi e salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
