"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

interface Product {
  id: number;
  name: string;
  quantity: number;
}

export default function RapidaPage() {
  const supabase = createClient();
  const [salon, setSalon] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<Product[]>([]);

  // ============================
  // USER → SALONE
  // ============================
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const s = data.user?.user_metadata?.salon_id ?? "";
      setSalon(s);
    };
    load();
  }, []);

  // ============================
  // CERCA PRODOTTI
  // ============================
  async function search() {
    if (!salon) return;

    const { data } = await supabase
      .from("products_with_stock")
      .select("*")
      .ilike("name", `%${query}%`)
      .eq("salon_id", salon);

    setResults((data as Product[]) || []);
  }

  // ============================
  // SCARICO -1
  // ============================
  async function scarica(id: number) {
    if (!salon) return;

    await supabase.rpc("stock_decrease", {
      p_salon: salon,
      p_product: id,
      p_qty: 1,
    });

    search();
  }

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3]">

      <h1 className="text-3xl font-bold mb-6 text-[#B88A54]">
        Gestione Rapida
      </h1>

      {/* BOX RICERCA */}
      <div className="bg-[#FDF8F3] text-[#341A09] p-6 rounded-2xl shadow-lg space-y-4">

        <input
          className="w-full p-4 rounded-xl bg-white border border-[#341A09]/30 text-[#341A09]"
          placeholder="Cerca prodotto…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <button
          onClick={search}
          className="w-full py-3 bg-[#341A09] text-[#FDF8F3] rounded-xl font-semibold shadow hover:scale-105 transition"
        >
          Cerca
        </button>
      </div>

      {/* RISULTATI */}
      <div className="mt-8 bg-[#FDF8F3] text-[#341A09] p-6 rounded-2xl shadow-lg space-y-4">

        {results.map((p) => (
          <div
            key={p.id}
            className="flex justify-between items-center border-b border-[#341A09]/15 py-3 hover:bg-[#F3E9DD] transition"
          >
            <div>
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs opacity-70">
                {p.quantity} disponibili
              </p>
            </div>

            <button
              className="px-4 py-2 bg-[#D63031] text-white rounded-lg font-semibold shadow hover:scale-105 transition"
              onClick={() => scarica(p.id)}
            >
              -1 Scarica
            </button>
          </div>
        ))}

        {results.length === 0 && (
          <p className="text-center opacity-70 py-6">
            Nessun prodotto trovato
          </p>
        )}

      </div>
    </div>
  );
}
