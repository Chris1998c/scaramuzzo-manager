"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useParams } from "next/navigation";

interface Product {
  id: number;
  name: string;
  quantity: number;
}

const SALONI = [
  { id: 0, name: "magazzino" },
  { id: 1, name: "Corigliano" },
  { id: 2, name: "Cosenza" },
  { id: 3, name: "Castrovillari" },
  { id: 4, name: "Roma" },
];

export default function TrasferimentoPage() {
  const { id } = useParams();
  const productId = Number(id);
   const supabase = createClient();
  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [salon, setSalon] = useState<number | null>(null);
  const [dest, setDest] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        setLoading(false);
        return;
      }

      const s = user.user_metadata?.salon_id ?? 0;
      setSalon(s);

      const { data: prod } = await supabase
        .from("products_with_stock")
        .select("*")
        .eq("salon_id", s)
        .eq("product_id", productId)
        .maybeSingle();

      setProduct(prod as Product | null);
      setLoading(false);
    }

    init();
  }, [productId]);

  async function handleTransfer() {
    if (!product || salon === null) return;

    await supabase.rpc("stock_decrease", {
      p_salon: salon,
      p_product: productId,
      p_qty: qty,
    });

    await supabase.rpc("stock_increase", {
      p_salon: dest,
      p_product: productId,
      p_qty: qty,
    });

    await supabase.from("stock_movements").insert({
      product_id: productId,
      from_salon: salon,
      to_salon: dest,
      quantity: qty,
      movement_type: "trasferimento",
    });

    window.history.back();
  }

  if (loading || salon === null) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] text-white min-h-screen">
        <p>Caricamento...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] text-white min-h-screen">
        <h1 className="text-3xl font-bold mb-6">Trasferimento</h1>
        <p className="text-white/60">Prodotto non trovato.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">
        Trasferimento — {product.name}
      </h1>

      <div className="bg-[#FFF9F4] p-6 rounded-xl text-[#341A09] max-w-lg">
        <label className="font-semibold block mb-2">Quantità</label>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-full p-3 rounded-xl bg-white"
        />

        <label className="font-semibold block mt-4 mb-2">Destinazione</label>
        <select
          className="w-full p-3 rounded-xl bg-white"
          value={dest}
          onChange={(e) => setDest(Number(e.target.value))}
        >
          {SALONI.filter((s) => s.id !== salon).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleTransfer}
          className="mt-6 px-6 py-3 bg-[#341A09] text-white rounded-xl"
        >
          Conferma Trasferimento
        </button>
      </div>
    </div>
  );
}
