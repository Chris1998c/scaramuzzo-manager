"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { PackageSearch, Pencil, QrCode, ArrowDown, ArrowUp } from "lucide-react";

export default function SchedaProdotto({ params }: { params: { id: string } }) {
  const productId = Number(params.id);
  const supabase = createClient();
  const [role, setRole] = useState("salone");
  const [product, setProduct] = useState<any>(null);
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const r = data.user?.user_metadata?.role ?? "salone";
      setRole(r);

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

  if (loading) return <div className="p-10 text-white">Caricamento…</div>;

  if (!product)
    return (
      <div className="p-10 text-red-600">
        Prodotto non trovato o eliminato.
      </div>
    );

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3] space-y-10">

      {/* HEADER */}
      <div className="flex items-center gap-4">
        <PackageSearch size={44} strokeWidth={1.5} className="text-[#B88A54]" />
        <h1 className="text-4xl font-bold text-[#B88A54]">
          {product.name}
        </h1>
      </div>

      {/* INFO BASE */}
      <div className="bg-[#FDF8F3] text-[#341A09] p-6 rounded-2xl shadow-xl space-y-4">

        <p><b>Categoria:</b> {product.category}</p>
        <p><b>Barcode:</b> {product.barcode || "-"}</p>
        <p><b>Costo:</b> {product.cost} €</p>
        <p><b>Tipo:</b> {product.type}</p>
        <p><b>Descrizione:</b> {product.description || "Nessuna descrizione"}</p>

      </div>

      {/* AZIONI RAPIDE */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">

        <Link
          href={`/dashboard/magazzino/carico?product=${productId}`}
          className="p-6 rounded-2xl bg-[#0FA958] text-white text-center font-semibold text-lg hover:scale-105 transition shadow-lg"
        >
          <ArrowDown className="mx-auto mb-3" size={34} />
          Carico
        </Link>

        <Link
          href={`/dashboard/magazzino/scarico?product=${productId}`}
          className="p-6 rounded-2xl bg-red-600 text-white text-center font-semibold text-lg hover:scale-105 transition shadow-lg"
        >
          <ArrowUp className="mx-auto mb-3" size={34} />
          Scarico
        </Link>

        <Link
          href={`/dashboard/magazzino/prodotto/${productId}/qr`}
          className="p-6 rounded-2xl bg-[#B88A54] text-white text-center font-semibold text-lg hover:scale-105 transition shadow-lg"
        >
          <QrCode className="mx-auto mb-3" size={34} />
          QR Code
        </Link>

        {role === "" && (
          <Link
            href={`/dashboard/magazzino/prodotto/${productId}/modifica`}
            className="p-6 rounded-2xl bg-[#341A09] text-white text-center font-semibold text-lg hover:scale-105 transition shadow-lg"
          >
            <Pencil className="mx-auto mb-3" size={34} />
            Modifica
          </Link>
        )}
      </div>

      {/* GIACENZE */}
      <div className="bg-[#FDF8F3] text-[#341A09] p-6 rounded-2xl shadow-xl">
        <h2 className="text-2xl font-bold mb-4 text-[#B88A54]">
          Giacenze nei Saloni
        </h2>

        {stock.map((s) => (
          <div key={s.id} className="border-b py-3 flex justify-between">
            <span className="font-semibold">{s.salon_id}</span>
            <span className={s.quantity <= 5 ? "text-red-600 font-bold" : ""}>
              {s.quantity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
