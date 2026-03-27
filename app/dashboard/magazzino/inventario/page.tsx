"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { LayoutList, ChevronUp, ChevronDown } from "lucide-react";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

interface Product {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
}

// SOLO saloni veri: 1..MAGAZZINO_CENTRALE_ID (5)
function isValidSalonId(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    n >= 1 &&
    n <= MAGAZZINO_CENTRALE_ID
  );
}

export default function InventarioPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role, activeSalonId, allowedSalons, isReady, receptionSalonId } = useActiveSalon();

  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [showOnlySottoscorta, setShowOnlySottoscorta] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "category" | "quantity" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const isWarehouse = role === "magazzino" || role === "coordinator";

  // ctxSalonId: warehouse = switcher; reception = receptionSalonId (staff.salon_id)
  const ctxSalonId: number | null = (() => {
    if (!isReady) return null;

    if (isWarehouse) {
      const v = isValidSalonId(activeSalonId) ? activeSalonId : MAGAZZINO_CENTRALE_ID;
      return v;
    }

    return isValidSalonId(receptionSalonId) ? receptionSalonId : null;
  })();

  const canCarico = isWarehouse && ctxSalonId === MAGAZZINO_CENTRALE_ID;

  const salonName =
    ctxSalonId == null
      ? "—"
      : allowedSalons.find((s) => s.id === ctxSalonId)?.name ?? `Salone ${ctxSalonId}`;

  async function fetchProducts(salonId: number, search: string, cat: string) {
    let query = supabase
      .from("products_with_stock")
      .select("product_id, name, category, barcode, quantity")
      .eq("salon_id", salonId);

    if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
    if (cat.trim()) query = query.eq("category", cat.trim());

    const { data, error } = await query;
    if (error) throw error;

    return (data as Product[]) || [];
  }

  // ✅ fetch quando cambia salone / filtri
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isReady) return;

      setErrMsg(null);

      if (ctxSalonId == null) {
        setProducts([]);
        setLoading(false);
        setErrMsg(
          isWarehouse
            ? "Nessun salone selezionato: usa lo switcher in alto."
            : "Questo utente non ha un salone associato: non posso mostrare l’inventario."
        );
        return;
      }

      try {
        setLoading(true);
        const rows = await fetchProducts(ctxSalonId, filter, category);
        if (!cancelled) setProducts(rows);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          setProducts([]);
          setErrMsg(e?.message ?? "Errore nel caricamento inventario.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [isReady, ctxSalonId, filter, category, isWarehouse]); // ✅ ctxSalonId è la chiave

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

  const totalProducts = products.length;
  const inSottoscorta = products.filter((p) => p.quantity <= 5).length;

  const categoriesFromData = useMemo(
    () =>
      [...new Set(products.map((p) => p.category).filter((c): c is string => c != null && String(c).trim() !== ""))].sort(),
    [products]
  );

  const displayedProducts = useMemo(
    () => (showOnlySottoscorta ? products.filter((p) => p.quantity <= 5) : products),
    [products, showOnlySottoscorta]
  );

  const sortedProducts = useMemo(() => {
    if (!sortKey) return displayedProducts;
    const list = [...displayedProducts];
    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === "name") {
        return mult * (a.name || "").localeCompare(b.name || "", "it");
      }
      if (sortKey === "category") {
        const ca = (a.category ?? "").trim();
        const cb = (b.category ?? "").trim();
        return mult * ca.localeCompare(cb, "it");
      }
      if (sortKey === "quantity") {
        return mult * (a.quantity - b.quantity);
      }
      return 0;
    });
    return list;
  }, [displayedProducts, sortKey, sortDir]);

  function handleSort(col: "name" | "category" | "quantity") {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  function csvCell(v: unknown): string {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  }

  function handleExportCsv() {
    if (ctxSalonId == null) return;
    const rows = [
      ["Prodotto", "Categoria", "Barcode", "Giacenza"],
      ...sortedProducts.map((p) => [
        p.name,
        p.category ?? "",
        p.barcode ?? "",
        String(p.quantity),
      ]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `inventario-salone-${ctxSalonId}-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white space-y-6">
      {/* HERO */}
      <div className="rounded-3xl border border-white/10 bg-scz-dark shadow-[0_0_60px_rgba(0,0,0,0.25)] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 md:p-7 bg-black/20 border-b border-white/10">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl p-3 bg-black/30 border border-white/10">
              <LayoutList className="text-[#f3d8b6]" size={28} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
                Magazzino
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                Inventario
              </h1>
              <p className="text-white/60 mt-1">
                Giacenze e prodotti per <span className="font-semibold text-white/90">{salonName}</span>
              </p>
              <p className="text-white/50 text-sm mt-1">
                {isWarehouse
                  ? "Cambia salone dallo switcher in alto."
                  : "Visualizzazione del tuo salone."}
              </p>
            </div>
          </div>
          <div className="shrink-0 self-start sm:self-center flex flex-wrap gap-2">
            <button
              className="px-5 py-3 rounded-xl bg-black/30 border border-white/10 text-[#f3d8b6] font-semibold hover:bg-black/40 transition"
              onClick={() => window.print()}
            >
              Stampa
            </button>
            <button
              className="px-5 py-3 rounded-xl bg-black/30 border border-white/10 text-[#f3d8b6] font-semibold hover:bg-black/40 transition"
              onClick={handleExportCsv}
            >
              Esporta CSV
            </button>
            <button
              className="px-5 py-3 rounded-xl bg-black/30 border border-white/10 text-[#f3d8b6] font-semibold hover:bg-black/40 transition"
              onClick={async () => {
                if (ctxSalonId == null) return;
                try {
                  setLoading(true);
                  setErrMsg(null);
                  const rows = await fetchProducts(ctxSalonId, filter, category);
                  setProducts(rows);
                } catch (e: any) {
                  console.error(e);
                  setErrMsg(e?.message ?? "Errore aggiornamento inventario.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Aggiorna
            </button>
          </div>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl p-5 bg-black/20 border border-white/10">
          <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
            Totale prodotti
          </div>
          <div className="text-3xl font-extrabold text-[#f3d8b6]">{totalProducts}</div>
        </div>
        <div className="rounded-2xl p-5 bg-black/20 border border-white/10">
          <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
            In sottoscorta
          </div>
          <div className={`text-3xl font-extrabold ${inSottoscorta > 0 ? "text-red-400" : "text-[#f3d8b6]"}`}>
            {inSottoscorta}
          </div>
        </div>
      </div>

      {/* FILTRI */}
      <div className="rounded-2xl border border-white/10 bg-scz-dark p-4 md:p-5 space-y-4">
        <div className="text-[10px] font-black uppercase tracking-wider text-white/50">Filtri</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">Cerca prodotto</label>
            <input
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder:text-white/40 focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30"
              placeholder="Nome prodotto..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">Categoria</label>
            <select
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Tutte le categorie</option>
              {categoriesFromData.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl bg-black/20 border border-white/10 w-full md:w-auto">
              <input
                type="checkbox"
                checked={showOnlySottoscorta}
                onChange={(e) => setShowOnlySottoscorta(e.target.checked)}
                className="rounded border-white/30 bg-black/30 text-[#f3d8b6] focus:ring-[#f3d8b6]/50"
              />
              <span className="text-sm font-medium text-white/90">Solo sottoscorta</span>
            </label>
          </div>
        </div>
      </div>

      {/* TABELLA */}
      <div className="bg-[#FFF9F4] text-[#341A09] p-6 rounded-xl shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#341A09]/20 font-semibold">
              <th className="p-3 text-left">
                <button
                  type="button"
                  onClick={() => handleSort("name")}
                  className="flex items-center gap-1 text-left hover:text-[#341A09]/80 transition"
                >
                  Prodotto
                  {sortKey === "name" && (sortDir === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                </button>
              </th>
              <th className="p-3 text-left">
                <button
                  type="button"
                  onClick={() => handleSort("category")}
                  className="flex items-center gap-1 text-left hover:text-[#341A09]/80 transition"
                >
                  Categoria
                  {sortKey === "category" && (sortDir === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                </button>
              </th>
              <th className="p-3 text-left">Barcode</th>
              <th className="p-3 text-left">
                <button
                  type="button"
                  onClick={() => handleSort("quantity")}
                  className="flex items-center gap-1 text-left hover:text-[#341A09]/80 transition"
                >
                  Giacenza
                  {sortKey === "quantity" && (sortDir === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                </button>
              </th>
              <th className="p-3 text-right w-[1%]">Azioni</th>
            </tr>
          </thead>

          <tbody>
            {sortedProducts.map((p) => (
              <tr key={p.product_id} className="border-b">
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.category ?? "-"}</td>
                <td className="p-3">{p.barcode || "-"}</td>

                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    <span className={p.quantity <= 5 ? "font-bold text-red-600" : ""}>
                      {p.quantity}
                    </span>
                    <span
                      className={`inline-flex w-fit px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                        p.quantity <= 5
                          ? "bg-red-500/20 text-red-700"
                          : "bg-[#341A09]/15 text-[#341A09]/80"
                      }`}
                    >
                      {p.quantity <= 5 ? "Sottoscorta" : "OK"}
                    </span>
                  </div>
                </td>

                <td className="p-3 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {canCarico && (
                      <Link
                        href={`/dashboard/magazzino/carico?product=${p.product_id}`}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#0FA958] text-white hover:opacity-90 transition"
                      >
                        Carico
                      </Link>
                    )}
                    <Link
                      href={`/dashboard/magazzino/scarico?product=${p.product_id}`}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-600/90 text-white hover:opacity-90 transition"
                    >
                      Scarico
                    </Link>
                    {isWarehouse && (
                      <>
                        <Link
                          href={`/dashboard/magazzino/prodotto/${p.product_id}/modifica`}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#341A09]/90 text-white hover:opacity-90 transition"
                        >
                          Modifica
                        </Link>
                        <Link
                          href={`/dashboard/magazzino/prodotto/${p.product_id}/qr`}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#B88A54]/90 text-white hover:opacity-90 transition"
                        >
                          QR
                        </Link>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sortedProducts.length === 0 && (
          <div className="text-center text-sm opacity-60 py-10">
            {products.length === 0
              ? "Nessun prodotto trovato."
              : "Nessun prodotto in sottoscorta nella lista attuale."}
          </div>
        )}
      </div>
    </div>
  );
}
