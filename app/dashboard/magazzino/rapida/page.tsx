"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

interface Product {
  product_id: number;
  name: string;
  quantity: number;
}

export default function RapidaPage() {
  const supabase = createClient();

  const [salonId, setSalonId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  // ============================
  // USER → SALON_ID (NUMBER)
  // ============================
  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const s = data.user?.user_metadata?.salon_id ?? null;
      setSalonId(typeof s === "number" ? s : Number(s));
    }
    loadUser();
  }, []);

  // ============================
  // SEARCH PRODUCTS
  // ============================
  async function search() {
    if (!salonId || !query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);

    const { data } = await supabase
      .from("products_with_stock")
      .select("product_id, name, quantity")
      .eq("salon_id", salonId)
      .ilike("name", `%${query.trim()}%`)
      .order("name");

    setResults((data as Product[]) || []);
    setLoading(false);
  }

  // ============================
  // QUICK DECREASE -1
  // ============================
  async function scarica(productId: number) {
    if (!salonId) return;

    await supabase.rpc("stock_decrease", {
      p_salon: salonId,
      p_product: productId,
      p_qty: 1,
    });

    // refresh results
    await search();
  }

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3]">
      <h1 className="text-3xl font-bold mb-6 text-[#B88A54]">
        Gestione Rapida
      </h1>

      {/* SEARCH */}
      <div className="bg-[#FDF8F3] text-[#341A09] p-6 rounded-2xl shadow-lg space-y-4">
        <input
          className="w-full p-4 rounded-xl bg-white border border-[#341A09]/30"
          placeholder="Cerca prodotto…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />

        <button
          onClick={search}
          className="w-full py-3 bg-[#341A09] text-white rounded-xl font-semibold shadow hover:scale-105 transition"
        >
          Cerca
        </button>
      </div>

      {/* RESULTS */}
      <div className="mt-8 bg-[#FDF8F3] text-[#341A09] p-6 rounded-2xl shadow-lg space-y-2">
        {loading && (
          <p className="text-center opacity-60 py-4">Ricerca in corso…</p>
        )}

        {!loading &&
          results.map((p) => (
            <div
              key={p.product_id}
              className="flex justify-between items-center border-b py-3"
            >
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs opacity-70">
                  {p.quantity} disponibili
                </p>
              </div>

              <button
                disabled={p.quantity <= 0}
                onClick={() => scarica(p.product_id)}
                className="px-4 py-2 bg-[#D63031] text-white rounded-lg font-semibold shadow disabled:opacity-40 hover:scale-105 transition"
              >
                −1
              </button>
            </div>
          ))}

        {!loading && results.length === 0 && (
          <p className="text-center opacity-60 py-6">
            Nessun prodotto trovato
          </p>
        )}
      </div>
    </div>
  );
}
