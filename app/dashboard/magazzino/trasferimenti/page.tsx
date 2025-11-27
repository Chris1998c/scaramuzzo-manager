"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { Repeat } from "lucide-react";

interface Product {
  id: number;
  name: string;
  quantity: number;
}

interface SelectedItem {
  id: number;
  name: string;
  qty: number;
}

const SALONI = [
  { id: "corigliano", name: "Scaramuzzo Corigliano" },
  { id: "cosenza", name: "Scaramuzzo Cosenza" },
  { id: "castrovillari", name: "Scaramuzzo Castrovillari" },
  { id: "roma", name: "Scaramuzzo Roma" },
  { id: "magazzino", name: "Magazzino Centrale" },
];

export default function TrasferimentiPage() {
  const [role, setRole] = useState<string>("salone");
  const [fromSalon, setFromSalon] = useState<string>("");
  const [toSalon, setToSalon] = useState<string>("corigliano");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      const s = user?.user_metadata?.salon_id ?? "";
      setFromSalon(s);
      setRole(user?.user_metadata?.role ?? "salone");

      fetchProducts(s);
    };
    load();
  }, []);

  async function fetchProducts(s: string) {
    const { data } = await supabase
      .from("products_with_stock")
      .select("*")
      .eq("salon_id", s);

    setProducts((data as Product[]) || []);
  }

  function add(prod: Product) {
    setSelected((prev) => [...prev, { id: prod.id, name: prod.name, qty: 1 }]);
  }

  function changeQty(id: number, qty: number) {
    setSelected((prev) =>
      prev.map((p) => (p.id === id ? { ...p, qty } : p))
    );
  }

  async function completa() {
    await fetch("/api/magazzino/trasferimenti", {
      method: "POST",
      body: JSON.stringify({
        fromSalon,
        toSalon,
        items: selected,
      }),
    });

    alert("Trasferimento completato!");
    setSelected([]);
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
            onChange={(e) => {
              setFromSalon(e.target.value);
              fetchProducts(e.target.value);
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
            onChange={(e) => setToSalon(e.target.value)}
          >
            {SALONI.map((s) => (
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
            <div key={p.id} className="flex justify-between border-b py-2">
              <span>{p.name}</span>
              <button
                className="px-3 py-1 bg-[#341A09] text-white rounded-lg"
                onClick={() => add(p)}
              >
                Aggiungi
              </button>
            </div>
          ))}
        </div>

        {/* TRASFERITI */}
        <div className="bg-[#FDF8F3] text-[#341A09] p-6 rounded-2xl shadow space-y-3">
          <h2 className="font-semibold text-xl text-[#B88A54]">Trasferiti</h2>

          {selected.map((s) => (
            <div key={s.id} className="flex justify-between border-b py-2">
              <span>{s.name}</span>
              <input
                type="number"
                min={1}
                className="border w-20 p-1 bg-white"
                value={s.qty}
                onChange={(e) => changeQty(s.id, Number(e.target.value))}
              />
            </div>
          ))}

          <button
            className="w-full py-4 mt-5 bg-[#0FA958] text-white rounded-2xl text-lg font-semibold hover:scale-105 transition"
            onClick={completa}
          >
            Completa Trasferimento
          </button>
        </div>

      </div>
    </div>
  );
}
