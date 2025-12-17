"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";

interface Product {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
}

const SALONI_LABEL = [
  "Magazzino",
  "Corigliano",
  "Cosenza",
  "Castrovillari",
  "Roma",
];

export default function InventarioPage() {
  const supabase = createClient();

  const [role, setRole] = useState<string>("salone");
  const [salon, setSalon] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");

  // LOAD USER + INVENTARIO
  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;

      if (!user?.user_metadata?.salon_id) return;

      setRole(user.user_metadata.role ?? "salone");
      setSalon(user.user_metadata.salon_id);
    }

    init();
  }, []);

  // FETCH PRODOTTI
  async function fetchProducts(
    salonId: number,
    search: string,
    cat: string
  ) {
    let query = supabase
      .from("products_with_stock")
      .select("*")
      .eq("salon_id", salonId);

    if (search) query = query.ilike("name", `%${search}%`);
    if (cat) query = query.eq("category", cat);

    const { data } = await query;
    setProducts((data as Product[]) || []);
  }

  // FILTRI LIVE
  useEffect(() => {
    if (salon !== null) {
      fetchProducts(salon, filter, category);
    }
  }, [salon, filter, category]);

  if (salon === null) return null;

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-3">
        Inventario — {SALONI_LABEL[salon]}
      </h1>

      <p className="text-white/60 mb-6">
        Visualizzazione sincronizzata con il selettore salone.
      </p>

      {/* FILTRI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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

        <button
          className="bg-[#341A09] text-white rounded-xl shadow px-6"
          onClick={() => fetchProducts(salon, filter, category)}
        >
          Aggiorna
        </button>
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
                <td className="p-3">{p.category}</td>
                <td className="p-3">{p.barcode || "-"}</td>

                <td className="p-3">
                  {p.quantity <= 5 ? (
                    <span className="text-red-600 font-bold">
                      {p.quantity}
                    </span>
                  ) : (
                    p.quantity
                  )}
                </td>

                <td className="p-3 text-right space-x-3">
                  <Link
                    href={`/dashboard/magazzino/carico?product=${p.product_id}`}
                    className="px-3 py-1 bg-[#0FA958] text-white rounded"
                  >
                    Carico
                  </Link>

                  <Link
                    href={`/dashboard/magazzino/scarico?product=${p.product_id}`}
                    className="px-3 py-1 bg-red-600 text-white rounded"
                  >
                    Scarico
                  </Link>

                  {(role === "magazzino" || role === "coordinator") && (
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
      </div>
    </div>
  );
}
