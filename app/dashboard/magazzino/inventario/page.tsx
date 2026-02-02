"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

interface Product {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
}

export default function InventarioPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role, activeSalonId, allowedSalons, isReady } = useActiveSalon();

  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const isWarehouse = role === "magazzino" || role === "coordinator";
  const canCarico = isWarehouse && activeSalonId === MAGAZZINO_CENTRALE_ID;

  const salonName =
    activeSalonId == null
      ? "—"
      : allowedSalons.find((s) => s.id === activeSalonId)?.name ?? `Salone ${activeSalonId}`;

  async function fetchProducts(salonId: number, search: string, cat: string) {
    let query = supabase
      .from("products_with_stock")
      .select("product_id, name, category, barcode, quantity")
      .eq("salon_id", salonId);

    if (search) query = query.ilike("name", `%${search}%`);
    if (cat) query = query.eq("category", cat);

    const { data, error } = await query;

    if (error) {
      console.error(error);
      setProducts([]);
      return;
    }

    setProducts((data as Product[]) || []);
  }

  // fetch quando cambia salone / filtri
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isReady) return;

      setErrMsg(null);

      if (activeSalonId == null) {
        setErrMsg("Nessun salone selezionato: non posso mostrare l’inventario.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        await fetchProducts(activeSalonId, filter, category);
      } catch (e) {
        console.error(e);
        if (!cancelled) setErrMsg("Errore nel caricamento inventario.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [isReady, activeSalonId, filter, category]);

  if (!isReady || loading) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        Caricamento…
      </div>
    );
  }

  if (errMsg) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        <h1 className="text-3xl font-bold mb-3">Inventario</h1>
        <p className="text-white/70">{errMsg}</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2">Inventario — {salonName}</h1>
          <p className="text-white/60">
            {isWarehouse
              ? "Cambia salone dallo switcher in alto."
              : "Visualizzazione del tuo salone."}
          </p>
        </div>

        <button
          className="bg-[#341A09] text-white rounded-xl shadow px-6 py-3"
          onClick={() => {
            if (activeSalonId != null) fetchProducts(activeSalonId, filter, category);
          }}
        >
          Aggiorna
        </button>
      </div>

      {/* FILTRI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 mt-8">
        <input
          className="p-4 rounded-xl bg-[#FFF9F4] text-[#341A09] shadow"
          placeholder="Cerca prodotto..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <input
          className="p-4 rounded-xl bg-[#FFF9F4] text-[#341A09] shadow"
          placeholder="Categoria"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </div>

      {/* TABELLA */}
      <div className="bg-[#FFF9F4] text-[#341A09] p-6 rounded-xl shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b font-semibold">
              <th className="p-3 text-left">Prodotto</th>
              <th className="p-3 text-left">Categoria</th>
              <th className="p-3 text-left">Barcode</th>
              <th className="p-3 text-left">Giacenza</th>
              <th className="p-3 text-right">Azioni</th>
            </tr>
          </thead>

          <tbody>
            {products.map((p) => (
              <tr key={p.product_id} className="border-b">
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.category ?? "-"}</td>
                <td className="p-3">{p.barcode || "-"}</td>

                <td className="p-3">
                  {p.quantity <= 5 ? (
                    <span className="text-red-600 font-bold">{p.quantity}</span>
                  ) : (
                    p.quantity
                  )}
                </td>

                <td className="p-3 text-right space-x-3">
                  {/* CARICO: ha senso solo se sei su centrale (carico dal centrale verso un salone) */}
                  {canCarico && (
                    <Link
                      href={`/dashboard/magazzino/carico?product=${p.product_id}`}
                      className="px-3 py-1 bg-[#0FA958] text-white rounded"
                    >
                      Carico
                    </Link>
                  )}

                  <Link
                    href={`/dashboard/magazzino/scarico?product=${p.product_id}`}
                    className="px-3 py-1 bg-red-600 text-white rounded"
                  >
                    Scarico
                  </Link>

                  {isWarehouse && (
                    <>
                      <Link
                        href={`/dashboard/magazzino/prodotto/${p.product_id}/modifica`}
                        className="px-3 py-1 bg-[#341A09] text-white rounded"
                      >
                        Modifica
                      </Link>

                      <Link
                        href={`/dashboard/magazzino/prodotto/${p.product_id}/qr`}
                        className="px-3 py-1 bg-[#B88A54] text-white rounded"
                      >
                        QR
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {products.length === 0 && (
          <div className="text-center text-sm opacity-60 py-10">
            Nessun prodotto trovato.
          </div>
        )}
      </div>
    </div>
  );
}
