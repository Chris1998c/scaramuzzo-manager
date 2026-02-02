"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface Product {
  id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  cost: number;
  type: string;
  description: string | null;
}

interface StockRow {
  salon_id: number;
  quantity: number;
}

interface SalonRow {
  id: number;
  name: string;
}

export default function ModificaProdottoPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const productId = Number(params.id);

  const [role, setRole] = useState("salone");
  const [loading, setLoading] = useState(true);

  const [product, setProduct] = useState<Product | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [salons, setSalons] = useState<SalonRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;

      const r = String(user?.user_metadata?.role ?? "");
      if (!r) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setRole(r);

      if (r !== "magazzino" && r !== "coordinator") {
        if (!cancelled) setLoading(false);
        return;
      }

      await Promise.all([fetchProduct(), fetchStock(), fetchSalons()]);
      if (!cancelled) setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [supabase, productId]);

  async function fetchProduct() {
    const { data, error } = await supabase.from("products").select("*").eq("id", productId).single();
    if (error) throw error;
    setProduct(data as Product);
  }

  async function fetchStock() {
    const { data, error } = await supabase
      .from("products_with_stock")
      .select("salon_id, quantity")
      .eq("product_id", productId);

    if (error) throw error;
    setStock((data as StockRow[]) || []);
  }

  async function fetchSalons() {
    const { data, error } = await supabase.from("salons").select("id, name").order("id");
    if (error) throw error;
    setSalons((data as SalonRow[]) || []);
  }

  async function salva() {
    if (!product) return;

    const { error } = await supabase
      .from("products")
      .update({
        name: product.name,
        category: product.category,
        barcode: product.barcode || null,
        cost: Number(product.cost) || 0,
        type: product.type,
        description: product.description || null,
      })
      .eq("id", productId);

    if (error) {
      alert("Errore durante il salvataggio");
      console.error(error);
      return;
    }

    alert("Prodotto aggiornato");
  }

  async function elimina() {
    if (!confirm("Vuoi eliminare definitivamente il prodotto?")) return;

    const conferma = prompt('Scrivi "ELIMINA" per confermare');
    if (conferma !== "ELIMINA") return;

    const { error } = await supabase.from("products").delete().eq("id", productId);

    if (error) {
      // fallback: disattiva
      await supabase.from("products").update({ active: false }).eq("id", productId);
      alert("Prodotto disattivato");
      router.push("/dashboard/magazzino/inventario");
      return;
    }

    alert("Prodotto eliminato");
    router.push("/dashboard/magazzino/inventario");
  }

  if (loading) return <div className="p-10">Caricamento…</div>;

  if (role !== "magazzino" && role !== "coordinator") {
    return <div className="p-10 text-red-600">Non hai i permessi.</div>;
  }

  if (!product) return null;

  const salonName = (id: number) => salons.find((s) => s.id === id)?.name ?? `Salone #${id}`;

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
      <h1 className="text-3xl font-bold mb-8">Modifica Prodotto</h1>

      <div className="bg-[#FFF9F4] p-8 rounded-2xl shadow-xl text-[#341A09] space-y-6">
        <input
          className="p-4 w-full rounded-xl border"
          value={product.name}
          onChange={(e) => setProduct({ ...product, name: e.target.value })}
        />

        <input
          className="p-4 w-full rounded-xl border"
          value={product.category || ""}
          onChange={(e) => setProduct({ ...product, category: e.target.value })}
        />

        <input
          className="p-4 w-full rounded-xl border"
          value={product.barcode || ""}
          onChange={(e) => setProduct({ ...product, barcode: e.target.value })}
        />

        <input
          type="number"
          className="p-4 w-full rounded-xl border"
          value={product.cost}
          onChange={(e) => setProduct({ ...product, cost: Number(e.target.value) })}
        />

        <select
          className="p-4 w-full rounded-xl border bg-white"
          value={product.type}
          onChange={(e) => setProduct({ ...product, type: e.target.value })}
        >
          <option value="rivendita">Rivendita</option>
          <option value="uso-interno">Uso interno</option>
          <option value="store">Store</option>
        </select>

        <textarea
          className="p-4 w-full rounded-xl border min-h-[120px]"
          value={product.description || ""}
          onChange={(e) => setProduct({ ...product, description: e.target.value })}
        />

        <button
          onClick={salva}
          className="w-full bg-[#0FA958] text-white p-4 rounded-2xl text-xl font-bold"
        >
          Salva Modifiche
        </button>

        <button
          onClick={elimina}
          className="w-full bg-red-700 text-white p-4 rounded-2xl text-xl font-bold"
        >
          Elimina Prodotto
        </button>
      </div>

      <div className="mt-12 bg-white p-6 rounded-xl shadow-xl text-[#341A09]">
        <h2 className="text-2xl font-bold mb-4">Giacenze</h2>

        {stock.length === 0 ? (
          <div className="text-sm text-gray-600">Nessuna giacenza registrata.</div>
        ) : (
          stock.map((s) => (
            <div key={s.salon_id} className="border-b py-3 flex justify-between">
              <span>{salonName(s.salon_id)}</span>
              <span>{s.quantity}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
