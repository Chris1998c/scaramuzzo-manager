"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useParams } from "next/navigation";

interface ProductRow {
  product_id: number;
  name: string;
  quantity: number;
}

const SALONI = [
  { id: 5, name: "Magazzino" }, // ✅ magazzino centrale = 5 (come nel tuo backend)
  { id: 1, name: "Corigliano" },
  { id: 2, name: "Cosenza" },
  { id: 3, name: "Castrovillari" },
  { id: 4, name: "Roma" },
];

export default function TrasferimentoPage() {
  const params = useParams<{ id: string }>();
  const productId = Number(params?.id);

  const supabase = createClient();

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [fromSalon, setFromSalon] = useState<number | null>(null);
  const [dest, setDest] = useState<number>(1);
  const [loading, setLoading] = useState(true);

  const destOptions = useMemo(() => {
    if (fromSalon === null) return SALONI;
    return SALONI.filter((s) => s.id !== fromSalon);
  }, [fromSalon]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const s = user.user_metadata?.salon_id;
      const salon = typeof s === "number" ? s : Number(s);

      if (!salon || !productId) {
        setLoading(false);
        return;
      }

      setFromSalon(salon);

      // default destinazione: prima disponibile diversa dal fromSalon
      const firstDest = SALONI.find((x) => x.id !== salon)?.id ?? 1;
      setDest(firstDest);

      const { data: prod } = await supabase
        .from("products_with_stock")
        .select("product_id,name,quantity")
        .eq("salon_id", salon)
        .eq("product_id", productId)
        .maybeSingle();

      setProduct((prod as ProductRow) ?? null);
      setLoading(false);
    };

    init();
  }, [productId, supabase]);

  const handleTransfer = async () => {
    if (!product || fromSalon === null) return;
    if (qty <= 0) return;

    if (qty > product.quantity) {
      alert("Quantità superiore alla giacenza disponibile");
      return;
    }

    // 1) decrease from fromSalon
    const dec = await supabase.rpc("stock_decrease", {
      p_salon: fromSalon,
      p_product: product.product_id,
      p_qty: qty,
    });
    if (dec.error) {
      console.error(dec.error);
      alert("Errore scarico (da salone origine)");
      return;
    }

    // 2) increase on dest
    const inc = await supabase.rpc("stock_increase", {
      p_salon: dest,
      p_product: product.product_id,
      p_qty: qty,
    });
    if (inc.error) {
      console.error(inc.error);
      alert("Errore carico (su salone destinazione)");
      return;
    }

    // 3) log movement (usa i nomi colonna reali del tuo schema: qty + movement_type)
    const ins = await supabase.from("stock_movements").insert({
      product_id: product.product_id,
      from_salon: fromSalon,
      to_salon: dest,
      qty: qty, // ✅ non "quantity"
      movement_type: "transfer", // ✅ coerente con lo screenshot (transfer/increase/...)
    });

    if (ins.error) {
      console.error(ins.error);
      // non blocchiamo: stock già aggiornato
    }

    window.history.back();
  };

  if (loading || fromSalon === null) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] text-white min-h-screen">
        Caricamento…
      </div>
    );
  }

  if (!product) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] text-white min-h-screen">
        <h1 className="text-3xl font-bold mb-6">Trasferimento</h1>
        <p className="text-white/60">Prodotto non trovato o senza giacenza.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">
        Trasferimento — {product.name}
      </h1>

      <div className="bg-[#FFF9F4] p-6 rounded-xl text-[#341A09] max-w-lg">
        <p className="text-sm opacity-70 mb-4">Disponibili: {product.quantity}</p>

        <label className="font-semibold block mb-2">Quantità</label>
        <input
          type="number"
          min={1}
          max={product.quantity}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-full p-3 rounded-xl bg-white border"
        />

        <label className="font-semibold block mt-4 mb-2">Destinazione</label>
        <select
          className="w-full p-3 rounded-xl bg-white border"
          value={dest}
          onChange={(e) => setDest(Number(e.target.value))}
        >
          {destOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleTransfer}
          disabled={qty <= 0 || qty > product.quantity || dest === fromSalon}
          className="mt-6 px-6 py-3 bg-[#341A09] text-white rounded-xl disabled:opacity-40"
        >
          Conferma Trasferimento
        </button>
      </div>
    </div>
  );
}
