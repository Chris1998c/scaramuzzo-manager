"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { Repeat } from "lucide-react";

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
  { id: 5, name: "Magazzino Centrale" }, // ✅ magazzino = 5
  { id: 1, name: "Scaramuzzo Corigliano" },
  { id: 2, name: "Scaramuzzo Cosenza" },
  { id: 3, name: "Scaramuzzo Castrovillari" },
  { id: 4, name: "Scaramuzzo Roma" },
];

export default function TrasferimentiPage() {
  const supabase = createClient();

  const [role, setRole] = useState<string>("salone");
  const [fromSalon, setFromSalon] = useState<number | null>(null);
  const [toSalon, setToSalon] = useState<number>(1);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selected, setSelected] = useState<SelectedItem[]>([]);

  const toOptions = useMemo(() => {
    if (fromSalon === null) return SALONI;
    return SALONI.filter((s) => s.id !== fromSalon);
  }, [fromSalon]);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const r = (user?.user_metadata?.role as string) ?? "salone";
      setRole(r);

      const s = user?.user_metadata?.salon_id ?? null;
      const salon = typeof s === "number" ? s : Number(s);

      if (!salon) return;

      setFromSalon(salon);

      // default "A": primo salone diverso dal from
      const firstTo = SALONI.find((x) => x.id !== salon)?.id ?? 1;
      setToSalon(firstTo);

      await fetchProducts(salon);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        items: selected.map((x) => ({ id: x.product_id, qty: x.qty })), // ✅ compat API (id, qty)
        executeNow: true, // ✅ se il tuo endpoint supporta esecuzione immediata
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

  if (fromSalon === null) {
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
      <div className="grid grid-cols-2 gap-6 bg-[#FDF8F3] text-[#341A09] p-6 shadow rounded-2xl">
        <div>
          <label className="font-semibold">Da</label>
          <select
            className="border p-3 rounded w-full bg-white mt-1"
            value={fromSalon}
            onChange={async (e) => {
              const v = Number(e.target.value);
              setFromSalon(v);
              // se "A" è uguale al nuovo from, spostalo
              const firstTo = SALONI.find((x) => x.id !== v)?.id ?? 1;
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
      <div className="grid grid-cols-2 gap-8">
        {/* DISPONIBILI */}
        <div className="bg-[#FDF8F3] text-[#341A09] p-6 rounded-2xl shadow space-y-3">
          <h2 className="font-semibold text-xl text-[#B88A54]">Disponibili</h2>

          {products.map((p) => (
            <div key={p.product_id} className="flex justify-between border-b py-2">
              <span>
                {p.name} <span className="opacity-60 text-sm">({p.quantity})</span>
              </span>
              <button
                className="px-3 py-1 bg-[#341A09] text-white rounded-lg"
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
              <div key={s.product_id} className="flex justify-between border-b py-2 items-center">
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
            className="w-full py-4 mt-5 bg-[#0FA958] text-white rounded-2xl text-lg font-semibold hover:scale-105 transition disabled:opacity-40"
            onClick={completa}
            disabled={!selected.length || fromSalon === toSalon}
          >
            Completa Trasferimento
          </button>

          {(role === "salone") && (
            <p className="text-xs opacity-60">
              Nota: i permessi reali sono gestiti da API/RLS.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
