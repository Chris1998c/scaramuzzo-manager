"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useSearchParams } from "next/navigation";

interface Product {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number; // giacenza del MAGAZZINO CENTRALE
}

const MAGAZZINO_CENTRALE_ID = 0;

const SALONI: { id: number; name: string }[] = [
  { id: 1, name: "Corigliano" },
  { id: 2, name: "Cosenza" },
  { id: 3, name: "Castrovillari" },
  { id: 4, name: "Roma" },
];

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function CaricoPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const productId = toNumberOrNull(searchParams.get("product"));

  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);

  const [role, setRole] = useState<string>("reception");
  const [toSalonId, setToSalonId] = useState<number>(1);

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

        const r = String(user.user_metadata?.role ?? "reception");
        if (cancelled) return;
        setRole(r);

        // Solo magazzino/coordinator possono fare carico
        if (r !== "magazzino" && r !== "coordinator") {
          setErrorMsg("Permessi insufficienti per eseguire un carico.");
          return;
        }

        // Leggo il prodotto dal MAGAZZINO CENTRALE (0)
        const { data: prod, error: prodErr } = await supabase
          .from("products_with_stock")
          .select("product_id, name, category, barcode, quantity")
          .eq("salon_id", MAGAZZINO_CENTRALE_ID)
          .eq("product_id", productId)
          .maybeSingle();

        if (cancelled) return;

        if (prodErr) {
          console.error(prodErr);
          setErrorMsg("Errore nel recupero del prodotto dal magazzino centrale.");
          return;
        }

        setProduct((prod as Product) ?? null);
      } catch (err) {
        console.error("Carico init error:", err);
        if (!cancelled) setErrorMsg("Errore nel caricamento della pagina carico.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [productId, supabase]);

  const handleCarico = async () => {
    if (!product) return;

    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return;

    // non superare giacenza centrale
    if (q > product.quantity) {
      alert("Quantità superiore alla giacenza del magazzino centrale.");
      return;
    }

    const res = await fetch("/api/magazzino/carico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salonId: toSalonId, // DESTINAZIONE
        productId: product.product_id,
        qty: q,
        reason: "carico_app",
      }),
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch {}

    if (!res.ok || json?.error) {
      alert(json?.error ?? "Errore durante il carico");
      return;
    }

    window.history.back();
  };

  if (loading) {
    return (
      <div className="px-6 py-10 text-white bg-[#1A0F0A] min-h-screen">
        Caricamento…
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="px-6 py-10 text-white bg-[#1A0F0A] min-h-screen">
        <h1 className="text-3xl font-bold mb-6">Carico</h1>
        <p className="text-white/70">{errorMsg}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="px-6 py-10 text-white bg-[#1A0F0A] min-h-screen">
        <h1 className="text-3xl font-bold mb-6">Carico</h1>
        <p className="text-white/60">
          Prodotto non trovato nel magazzino centrale.
        </p>
      </div>
    );
  }

  const disabled = qty <= 0 || qty > product.quantity;

  return (
    <div className="px-6 py-10 text-white bg-[#1A0F0A] min-h-screen">
      <h1 className="text-3xl font-bold mb-2">Carico — {product.name}</h1>
      <p className="text-white/60 mb-6">
        Magazzino centrale disponibili: <b>{product.quantity}</b>
      </p>

      <div className="bg-[#FFF9F4] p-6 rounded-xl text-[#341A09] max-w-lg space-y-4">
        <div>
          <label className="font-semibold block mb-2">Salone destinazione</label>
          <select
            value={toSalonId}
            onChange={(e) => setToSalonId(Number(e.target.value))}
            className="w-full p-3 rounded-xl border bg-white"
          >
            {SALONI.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-semibold block mb-2">Quantità da caricare</label>
          <input
            type="number"
            min={1}
            max={product.quantity}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="w-full p-3 rounded-xl border bg-white"
          />
          <p className="mt-2 text-sm opacity-70">
            Max: {product.quantity}
          </p>
        </div>

        <button
          onClick={handleCarico}
          disabled={disabled}
          className="mt-2 px-6 py-3 bg-[#0FA958] rounded-xl text-white disabled:opacity-40"
        >
          Conferma Carico
        </button>
      </div>
    </div>
  );
}
