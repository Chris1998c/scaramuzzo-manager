"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useSearchParams } from "next/navigation";

interface Product {
  id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
}

export default function ScaricoPage() {
  const searchParams = useSearchParams();
  const productId = Number(searchParams.get("product"));
   const supabase = createClient();
  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [salon, setSalon] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        setLoading(false);
        return;
      }

      const userSalon = user.user_metadata?.salon_id ?? 0;
      setSalon(userSalon);

      const { data: prod } = await supabase
        .from("products_with_stock")
        .select("*")
        .eq("salon_id", userSalon)
        .eq("product_id", productId)
        .maybeSingle();

      setProduct(prod as Product | null);
      setLoading(false);
    }

    init();
  }, [productId]);

  async function handleScarico() {
    if (!salon || !product) return;

    await supabase.rpc("stock_decrease", {
      p_salon: salon,
      p_product: productId,
      p_qty: qty,
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
        <h1 className="text-3xl font-bold mb-6">Scarico</h1>
        <p className="text-white/60">Prodotto non trovato.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Scarico — {product.name}</h1>

      <div className="bg-[#FFF9F4] p-6 rounded-xl text-[#341A09] max-w-lg">
        <label className="font-semibold block mb-2">Quantità da scaricare</label>

        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-full p-3 rounded-xl border bg-white"
        />

        <button
          onClick={handleScarico}
          className="mt-6 px-6 py-3 bg-red-600 rounded-xl text-white"
        >
          Conferma Scarico
        </button>
      </div>
    </div>
  );
}
