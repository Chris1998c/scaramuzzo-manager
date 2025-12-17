"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useSearchParams } from "next/navigation";

interface Product {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
}

export default function ScaricoPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const productId = Number(searchParams.get("product"));

  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [salonId, setSalonId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || Number.isNaN(productId)) {
        setLoading(false);
        return;
      }

      const rawSalon = user.user_metadata?.salon_id;
      const sId = typeof rawSalon === "number" ? rawSalon : Number(rawSalon);

      if (!sId) {
        setLoading(false);
        return;
      }

      setSalonId(sId);

      const { data } = await supabase
        .from("products_with_stock")
        .select("product_id, name, category, barcode, quantity")
        .eq("salon_id", sId)
        .eq("product_id", productId)
        .maybeSingle();

      setProduct((data as Product) ?? null);
      setLoading(false);
    })();
  }, [productId]);

  const handleScarico = async () => {
    if (!salonId || !product || qty <= 0 || qty > product.quantity) return;

    const { error } = await supabase.rpc("stock_decrease", {
      p_salon: salonId,
      p_product: product.product_id,
      p_qty: qty,
    });

    if (error) {
      alert("Errore scarico");
      return;
    }

    window.history.back();
  };

  if (loading) {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
        Caricamento…
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
        <h1 className="text-3xl font-bold mb-6">Scarico</h1>
        <p className="opacity-70">Prodotto non trovato o senza giacenza.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
      <h1 className="text-3xl font-bold mb-6">
        Scarico — {product.name}
      </h1>

      <div className="bg-[#FFF9F4] p-6 rounded-xl text-[#341A09] max-w-lg">
        <label className="font-semibold block mb-2">
          Quantità da scaricare
        </label>

        <input
          type="number"
          min={1}
          max={product.quantity}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-full p-3 rounded-xl border bg-white"
        />

        <p className="mt-2 text-sm opacity-70">
          Disponibili: {product.quantity}
        </p>

        <button
          onClick={handleScarico}
          disabled={qty <= 0 || qty > product.quantity}
          className="mt-6 px-6 py-3 bg-red-600 rounded-xl text-white disabled:opacity-40"
        >
          Conferma Scarico
        </button>
      </div>
    </div>
  );
}
