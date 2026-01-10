"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useSearchParams } from "next/navigation";

interface Product {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
}

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function ScaricoPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const productId = toNumberOrNull(searchParams.get("product"));

  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [salonId, setSalonId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setErrorMsg(null);

        if (!productId || productId <= 0) {
          setErrorMsg("Parametro prodotto mancante o non valido.");
          return;
        }

        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const user = data.user;
        if (!user) {
          setErrorMsg("Utente non autenticato.");
          return;
        }

        const sId = toNumberOrNull(user.user_metadata?.salon_id ?? null);
        if (sId === null) {
          setErrorMsg("salon_id non presente sull’utente.");
          return;
        }

        if (cancelled) return;
        setSalonId(sId);

        const { data: prod, error: prodErr } = await supabase
          .from("products_with_stock")
          .select("product_id, name, category, barcode, quantity")
          .eq("salon_id", sId)
          .eq("product_id", productId)
          .maybeSingle();

        if (cancelled) return;

        if (prodErr) {
          console.error(prodErr);
          setErrorMsg("Errore nel recupero del prodotto.");
          setProduct(null);
          return;
        }

        setProduct((prod as Product) ?? null);
      } catch (err) {
        console.error("Scarico init error:", err);
        if (!cancelled) setErrorMsg("Errore nel caricamento della pagina scarico.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [productId, supabase]);

  const handleScarico = async () => {
    if (salonId === null || !product) return;

    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return;
    if (q > product.quantity) return;

    const res = await fetch("/api/magazzino/scarico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salonId,
        productId: product.product_id,
        qty: q,
        reason: "scarico",
      }),
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok || json?.error) {
      alert(json?.error ?? "Errore scarico");
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

  if (errorMsg) {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
        <h1 className="text-3xl font-bold mb-6">Scarico</h1>
        <p className="opacity-70">{errorMsg}</p>
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

  const disabled = qty <= 0 || qty > product.quantity;

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
      <h1 className="text-3xl font-bold mb-6">Scarico — {product.name}</h1>

      <div className="bg-[#FFF9F4] p-6 rounded-xl text-[#341A09] max-w-lg">
        <label className="font-semibold block mb-2">Quantità da scaricare</label>

        <input
          type="number"
          min={1}
          max={product.quantity}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-full p-3 rounded-xl border bg-white"
        />

        <p className="mt-2 text-sm opacity-70">Disponibili: {product.quantity}</p>

        <button
          onClick={handleScarico}
          disabled={disabled}
          className="mt-6 px-6 py-3 bg-red-600 rounded-xl text-white disabled:opacity-40"
        >
          Conferma Scarico
        </button>
      </div>
    </div>
  );
}
