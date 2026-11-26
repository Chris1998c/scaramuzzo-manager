"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import {
  PackageSearch,
  Pencil,
  QrCode,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { salonLabel } from "@/lib/constants";
import {
  MagazzinoBackLink,
  MagazzinoHero,
  MagazzinoLoading,
  MagazzinoPageShell,
} from "@/components/magazzino/ui/magazzinoUi";
import { sczBtnGhost, sczBtnPrimary, sczBtnDanger } from "@/components/ui/PageHeader";

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

export default function SchedaProdotto() {
  const { id: idParam } = useParams<{ id: string }>();
  const productId = Number(idParam);
  const supabase = createClient();

  const [product, setProduct] = useState<Product | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { isReady } = useActiveSalon();

  useEffect(() => {
    async function init() {
      await fetchProduct();
      await fetchStock();
      setLoading(false);
    }

    if (!isReady) return;
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, productId]);

  async function fetchProduct() {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    setProduct(data as Product);
  }

  async function fetchStock() {
    const { data } = await supabase
      .from("products_with_stock")
      .select("salon_id, quantity")
      .eq("product_id", productId);

    setStock((data as StockRow[]) || []);
  }

  if (!isReady || loading) {
    return <MagazzinoLoading />;
  }

  if (!product) {
    return (
      <MagazzinoPageShell>
        <MagazzinoHero icon={PackageSearch} compact subtitle="Scheda prodotto" />
        <p className="text-sm text-red-300" role="alert">
          Prodotto non trovato o eliminato.
        </p>
        <MagazzinoBackLink href="/dashboard/magazzino/inventario" label="Torna all’inventario" />
      </MagazzinoPageShell>
    );
  }

  return (
    <MagazzinoPageShell>
      <MagazzinoHero
        icon={PackageSearch}
        compact
        subtitle={
          <span className="truncate">
            {product.name}
            {product.category ? (
              <>
                <span className="mx-2 text-white/25" aria-hidden>
                  ·
                </span>
                {product.category}
              </>
            ) : null}
          </span>
        }
        actions={
          <MagazzinoBackLink
            href="/dashboard/magazzino/inventario"
            label="Inventario"
          />
        }
      />

      <div className="rounded-xl border border-white/10 bg-scz-dark p-4 md:p-5 space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <p>
            <span className="text-white/45">Barcode</span>
            <span className="ml-2 text-white/90 tabular-nums">
              {product.barcode || "—"}
            </span>
          </p>
          <p>
            <span className="text-white/45">Costo</span>
            <span className="ml-2 text-[#f3d8b6] font-semibold tabular-nums">
              € {Number(product.cost ?? 0).toFixed(2)}
            </span>
          </p>
          <p>
            <span className="text-white/45">Tipo</span>
            <span className="ml-2 text-white/90">{product.type || "—"}</span>
          </p>
          <p className="sm:col-span-2">
            <span className="text-white/45">Descrizione</span>
            <span className="ml-2 text-white/80">
              {product.description || "Nessuna descrizione"}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Link
          href={`/dashboard/magazzino/carico?product=${productId}`}
          className={sczBtnPrimary}
        >
          <ArrowDown size={16} />
          Carico
        </Link>
        <Link
          href={`/dashboard/magazzino/scarico?product=${productId}`}
          className={sczBtnDanger}
        >
          <ArrowUp size={16} />
          Scarico
        </Link>
        <Link
          href={`/dashboard/magazzino/prodotto/${productId}/qr`}
          className={sczBtnGhost}
        >
          <QrCode size={16} />
          QR Code
        </Link>
        <span
          className={`${sczBtnGhost} opacity-50 cursor-not-allowed`}
          title="Modifica non disponibile"
        >
          <Pencil size={16} />
          Modifica
        </span>
      </div>

      <div className="rounded-xl border border-white/10 bg-scz-dark overflow-hidden">
        <div className="border-b border-white/[0.06] px-4 py-2.5">
          <h2 className="text-sm font-semibold text-[#f3d8b6]">
            Giacenze nei saloni
          </h2>
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {stock.length === 0 ? (
            <li className="px-4 py-6 text-sm text-white/45">
              Nessuna giacenza registrata.
            </li>
          ) : (
            stock.map((s) => (
              <li
                key={s.salon_id}
                className="px-4 py-3 flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-white/80">{salonLabel(s.salon_id)}</span>
                <span
                  className={`tabular-nums font-semibold ${
                    s.quantity <= 5 ? "text-red-400" : "text-[#f3d8b6]"
                  }`}
                >
                  {s.quantity}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </MagazzinoPageShell>
  );
}
