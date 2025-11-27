"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function ModificaProdottoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router = useRouter();
  const productId = Number(params.id);

  const [role, setRole] = useState("salone");
  const [loading, setLoading] = useState(true);

  const [product, setProduct] = useState<any>(null);
  const [stock, setStock] = useState<any[]>([]);

  // ===========================
  // GET USER + PERMESSI
  // ===========================
  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const r = data.user?.user_metadata?.role ?? "salone";
      setRole(r);

      if (r !== "magazzino") return;

      await fetchProduct();
      await fetchStock();
      setLoading(false);
    }
    load();
  }, []);

  async function fetchProduct() {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    setProduct(data);
  }

  async function fetchStock() {
    const { data } = await supabase
      .from("products_with_stock")
      .select("*")
      .eq("product_id", productId);

    setStock(data || []);
  }

  // ===========================
  // SALVA MODIFICHE
  // ===========================
  async function salva() {
    const { error } = await supabase
      .from("products")
      .update({
        name: product.name,
        category: product.category,
        barcode: product.barcode || null,
        cost: Number(product.cost) || 0,
        type: product.type,
        description: product.description,
      })
      .eq("id", productId);

    if (error) {
      alert("Errore durante il salvataggio");
      console.log(error);
      return;
    }

    alert("Prodotto aggiornato!");
  }

  // ===========================
  // ELIMINA PRODOTTO
  // ===========================
  async function elimina() {
    const conferma1 = confirm("ATTENZIONE: vuoi davvero eliminare questo prodotto?");
    if (!conferma1) return;

    const conferma2 = prompt('Scrivi "ELIMINA" per confermare');
    if (conferma2 !== "ELIMINA") {
      alert("Eliminazione annullata.");
      return;
    }

    // Tentativo di eliminazione totale
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    if (error) {
      // Se non si può eliminare → lo disattivo
      await supabase
        .from("products")
        .update({ active: false })
        .eq("id", productId);

      alert("Prodotto non eliminabile (ha movimenti), è stato DISATTIVATO.");
      router.push("/dashboard/magazzino/inventario");
      return;
    }

    alert("Prodotto eliminato!");
    router.push("/dashboard/magazzino/inventario");
  }

  if (loading) return <div className="p-10">Caricamento…</div>;

  if (role !== "magazzino")
    return <div className="p-10 text-red-600">Non hai i permessi.</div>;

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
      <h1 className="text-3xl font-bold mb-8">Modifica Prodotto</h1>

      {/* FORM */}
      <div className="bg-[#FFF9F4] p-8 rounded-2xl shadow-xl text-[#341A09] space-y-6">

        {/* Nome */}
        <div>
          <label className="font-semibold">Nome</label>
          <input
            className="mt-2 p-4 w-full rounded-xl border"
            value={product?.name || ""}
            onChange={(e) => setProduct({ ...product, name: e.target.value })}
          />
        </div>

        {/* Categoria */}
        <div>
          <label className="font-semibold">Categoria</label>
          <input
            className="mt-2 p-4 w-full rounded-xl border"
            value={product?.category || ""}
            onChange={(e) => setProduct({ ...product, category: e.target.value })}
          />
        </div>

        {/* Barcode */}
        <div>
          <label className="font-semibold">Barcode</label>
          <input
            className="mt-2 p-4 w-full rounded-xl border"
            value={product?.barcode || ""}
            onChange={(e) => setProduct({ ...product, barcode: e.target.value })}
          />
        </div>

        {/* Costo */}
        <div>
          <label className="font-semibold">Costo (€)</label>
          <input
            type="number"
            className="mt-2 p-4 w-full rounded-xl border"
            value={product?.cost || ""}
            onChange={(e) => setProduct({ ...product, cost: e.target.value })}
          />
        </div>

        {/* Tipo */}
        <div>
          <label className="font-semibold">Tipo</label>
          <select
            className="mt-2 p-4 w-full rounded-xl border"
            value={product?.type || "rivendita"}
            onChange={(e) => setProduct({ ...product, type: e.target.value })}
          >
            <option value="rivendita">Rivendita</option>
            <option value="uso-interno">Uso interno</option>
            <option value="store">Store</option>
          </select>
        </div>

        {/* Descrizione */}
        <div>
          <label className="font-semibold">Descrizione</label>
          <textarea
            className="mt-2 p-4 w-full rounded-xl border"
            rows={4}
            value={product?.description || ""}
            onChange={(e) =>
              setProduct({ ...product, description: e.target.value })
            }
          />
        </div>

        {/* SALVA */}
        <button
          className="mt-6 w-full bg-[#0FA958] text-white p-4 rounded-2xl text-xl font-bold shadow-lg hover:scale-105 transition"
          onClick={salva}
        >
          Salva Modifiche
        </button>

        {/* ELIMINA */}
        <button
          className="mt-3 w-full bg-red-700 text-white p-4 rounded-2xl text-xl font-bold shadow-lg hover:scale-105 transition"
          onClick={elimina}
        >
          Elimina Prodotto
        </button>
      </div>

      {/* STOCK */}
      <div className="mt-12 bg-white p-6 rounded-xl shadow-xl text-[#341A09]">
        <h2 className="text-2xl font-bold mb-4">Giacenze nei Saloni</h2>

        {stock.map((s) => (
          <div key={s.id} className="border-b py-3 flex justify-between">
            <span>{s.salon_id}</span>
            <span>{s.quantity}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
