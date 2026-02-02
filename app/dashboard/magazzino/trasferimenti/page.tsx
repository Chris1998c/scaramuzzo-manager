"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { Repeat } from "lucide-react";
import { useUI, MAGAZZINO_CENTRALE_ID } from "@/lib/ui-store";

interface ProductRow {
  product_id: number;
  name: string;
  quantity: number;
}

interface SelectedItem {
  product_id: number;
  name: string;
  qty: number;
}

const SALONI = [
  { id: 1, name: "Scaramuzzo Corigliano" },
  { id: 2, name: "Scaramuzzo Cosenza" },
  { id: 3, name: "Scaramuzzo Castrovillari" },
  { id: 4, name: "Scaramuzzo Roma" },
  { id: 5, name: "Magazzino Centrale" },
];

function toSalonId(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null; // accetta 0
}

export default function TrasferimentiPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId } = useUI(); // SEMPRE number (0 incluso)

  const [role, setRole] = useState<string>("reception");
  const [userSalonId, setUserSalonId] = useState<number | null>(null);

  const [fromSalon, setFromSalon] = useState<number | null>(null);
  const [toSalon, setToSalon] = useState<number>(1);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isWarehouse = role === "magazzino" || role === "coordinator";
  const disableFromSelect = !isWarehouse; // reception non cambia "Da"

  const toOptions = useMemo(() => {
    if (fromSalon === null) return SALONI.filter((s) => s.id !== MAGAZZINO_CENTRALE_ID);
    return SALONI.filter((s) => s.id !== fromSalon);
  }, [fromSalon]);

  function pickDefaultTo(from: number | null) {
    // se from è null -> fallback 1
    if (from === null) return 1;
    // scegli il primo salone "reale" diverso da from (può essere anche 0 se from !=0)
    const first =
      SALONI.find((x) => x.id !== from && x.id !== MAGAZZINO_CENTRALE_ID)?.id ??
      SALONI.find((x) => x.id !== from)?.id ??
      1;
    return first;
  }

  async function fetchProducts(salonId: number) {
    const { data, error } = await supabase
      .from("products_with_stock")
      .select("product_id,name,quantity")
      .eq("salon_id", salonId)
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      setProducts([]);
      return;
    }

    setProducts(((data as ProductRow[]) ?? []).filter((p) => (p.quantity ?? 0) > 0));
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const user = data.user;
        if (!user) return;

        const r = String(user.user_metadata?.role ?? "reception");
        const sid = toSalonId(user.user_metadata?.salon_id ?? null);

        if (cancelled) return;

        setRole(r);
        setUserSalonId(sid);

        const wh = r === "magazzino" || r === "coordinator";

        // DEFAULT DEFINITIVO:
        // - magazzino/coordinator: from = activeSalonId (default 0 centrale)
        // - reception/cliente: from = proprio salone (obbligatorio)
        const defaultFrom = wh ? (Number.isFinite(activeSalonId) ? activeSalonId : MAGAZZINO_CENTRALE_ID) : sid;

        setFromSalon(defaultFrom);

        const firstTo = pickDefaultTo(defaultFrom);
        setToSalon(firstTo);

        setSelected([]);

        if (defaultFrom !== null) {
          await fetchProducts(defaultFrom);
        } else {
          setProducts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // COERENZA DEFINITIVA CON HEADER:
  // se sei coordinator/magazzino e cambi "Vista" nell'header, cambiamo FROM
  useEffect(() => {
    if (loading) return;
    if (!isWarehouse) return;

    const v = Number.isFinite(activeSalonId) ? activeSalonId : MAGAZZINO_CENTRALE_ID;

    // se già uguale non fare nulla
    if (fromSalon === v) return;

    setFromSalon(v);
    const firstTo = pickDefaultTo(v);
    setToSalon(firstTo);
    setSelected([]);
    fetchProducts(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSalonId]);

  function add(prod: ProductRow) {
    setSelected((prev) => {
      const existing = prev.find((x) => x.product_id === prod.product_id);
      if (existing) {
        return prev.map((x) =>
          x.product_id === prod.product_id ? { ...x, qty: x.qty + 1 } : x
        );
      }
      return [...prev, { product_id: prod.product_id, name: prod.name, qty: 1 }];
    });
  }

  function changeQty(product_id: number, qty: number) {
    const safe = Number.isFinite(qty) ? qty : 1;
    setSelected((prev) =>
      prev
        .map((p) => (p.product_id === product_id ? { ...p, qty: safe } : p))
        .filter((p) => p.qty > 0)
    );
  }

  function maxFor(product_id: number) {
    return products.find((p) => p.product_id === product_id)?.quantity ?? 0;
  }

  async function completa() {
    if (fromSalon === null) return;
    if (!selected.length) return;
    if (fromSalon === toSalon) return;

    // BLOCCO DEFINITIVO: reception non esegue trasferimenti
    if (role === "reception" || role === "cliente") {
      alert("Come reception non puoi eseguire trasferimenti. Chiedi al magazzino.");
      return;
    }

    // valida qty vs giacenza
    for (const it of selected) {
      const max = maxFor(it.product_id);
      if (it.qty <= 0 || it.qty > max) {
        alert(`Quantità non valida per "${it.name}" (max ${max})`);
        return;
      }
    }

    const res = await fetch("/api/magazzino/trasferimenti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromSalon,
        toSalon,
        items: selected.map((x) => ({ id: x.product_id, qty: x.qty })),
        executeNow: true,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || json?.error) {
      console.error(json);
      alert(json?.error || "Errore trasferimento");
      return;
    }

    alert("Trasferimento completato!");
    setSelected([]);
    await fetchProducts(fromSalon);
  }

  // reception senza salon_id = blocco definitivo
  if (!loading && !isWarehouse && userSalonId === null) {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3]">
        <h1 className="text-3xl font-bold mb-3">Trasferimenti</h1>
        <p className="text-white/70">
          Questo utente non ha un <b>salon_id</b> associato. Contatta l’amministratore.
        </p>
      </div>
    );
  }

  if (loading || fromSalon === null) {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3]">
        Caricamento…
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3] space-y-10">
      {/* TITOLO */}
      <div className="flex items-center gap-4">
        <Repeat size={44} strokeWidth={1.5} className="text-[#B88A54]" />
        <h1 className="text-4xl font-bold text-[#B88A54]">
          Trasferimenti di Magazzino
        </h1>
      </div>

      {/* SELEZIONE SALONI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#FDF8F3] text-[#341A09] p-6 shadow rounded-2xl">
        <div>
          <label className="font-semibold">Da</label>
          <select
            className="border p-3 rounded w-full bg-white mt-1 disabled:opacity-60"
            value={fromSalon}
            disabled={disableFromSelect}
            onChange={async (e) => {
              const v = Number(e.target.value);
              setFromSalon(v);
              const firstTo = pickDefaultTo(v);
              setToSalon(firstTo);
              setSelected([]);
              await fetchProducts(v);
            }}
          >
            {SALONI.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {!isWarehouse && (
            <p className="text-xs opacity-60 mt-2">
              Come reception, lavori solo sul tuo salone.
            </p>
          )}
        </div>

        <div>
          <label className="font-semibold">A</label>
          <select
            className="border p-3 rounded w-full bg-white mt-1"
            value={toSalon}
            onChange={(e) => setToSalon(Number(e.target.value))}
          >
            {toOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* LISTE PRODOTTI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* DISPONIBILI */}
        <div className="bg-[#FDF8F3] text-[#341A09] p-6 rounded-2xl shadow space-y-3">
          <h2 className="font-semibold text-xl text-[#B88A54]">Disponibili</h2>

          {products.map((p) => (
            <div key={p.product_id} className="flex justify-between border-b py-2">
              <span>
                {p.name} <span className="opacity-60 text-sm">({p.quantity})</span>
              </span>
              <button
                className="px-3 py-1 bg-[#341A09] text-white rounded-lg hover:opacity-90 transition"
                onClick={() => add(p)}
              >
                Aggiungi
              </button>
            </div>
          ))}

          {products.length === 0 && (
            <div className="py-6 text-center opacity-60">Nessun prodotto disponibile</div>
          )}
        </div>

        {/* TRASFERITI */}
        <div className="bg-[#FDF8F3] text-[#341A09] p-6 rounded-2xl shadow space-y-3">
          <h2 className="font-semibold text-xl text-[#B88A54]">Trasferiti</h2>

          {selected.map((s) => {
            const max = maxFor(s.product_id);
            return (
              <div
                key={s.product_id}
                className="flex justify-between border-b py-2 items-center"
              >
                <span>
                  {s.name} <span className="opacity-60 text-sm">(max {max})</span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={max}
                  className="border w-24 p-1 bg-white"
                  value={s.qty}
                  onChange={(e) => changeQty(s.product_id, Number(e.target.value))}
                />
              </div>
            );
          })}

          <button
            className="w-full py-4 mt-5 bg-[#0FA958] text-white rounded-2xl text-lg font-semibold hover:scale-[1.02] transition disabled:opacity-40"
            onClick={completa}
            disabled={!selected.length || fromSalon === toSalon || role === "reception" || role === "cliente"}
          >
            Completa Trasferimento
          </button>

          {(role === "reception" || role === "cliente") && (
            <p className="text-xs opacity-60">
              Nota: come reception non puoi eseguire trasferimenti.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
