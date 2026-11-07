"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { ChevronUp, ChevronDown, MoreHorizontal } from "lucide-react";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";
import { useMagazzinoSalonContext } from "@/hooks/useMagazzinoSalonContext";
import {
  fetchInventarioCatalogPage,
  fetchInventarioCategories,
  inventarioUserFacingMessage,
  INVENTARIO_PAGE_SIZE,
  INVENTARIO_SOTTOSORTA_THRESHOLD,
  type InventarioProductRow,
} from "@/lib/magazzino/inventarioCatalog";

type Product = InventarioProductRow;

const fieldClass =
  "w-full min-w-0 rounded-lg bg-black/25 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-[#f3d8b6]/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d8b6]/35";

const ghostBtn =
  "inline-flex items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-[#f3d8b6]/90 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 disabled:opacity-40 transition";

export default function InventarioPage() {
  const supabase = useMemo(() => createClient(), []);
  const { isReady, isWarehouse, ctxSalonId, salonName } = useMagazzinoSalonContext();

  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [showOnlySottoscorta, setShowOnlySottoscorta] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sottoscortaCount, setSottoscortaCount] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [sortKey, setSortKey] = useState<"name" | "category" | "quantity" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const canCarico = isWarehouse && ctxSalonId === MAGAZZINO_CENTRALE_ID;

  useEffect(() => {
    if (!isReady) return;
    fetchInventarioCategories(supabase)
      .then(setCategories)
      .catch((e) => console.error(e));
  }, [isReady, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isReady) return;

      setErrMsg(null);

      if (ctxSalonId == null) {
        setProducts([]);
        setTotalCount(0);
        setSottoscortaCount(0);
        setPageCount(1);
        setLoading(false);
        setErrMsg(
          isWarehouse
            ? "Nessun salone selezionato: usa lo switcher in alto."
            : "Questo utente non ha un salone associato: non posso mostrare l’inventario.",
        );
        return;
      }

      try {
        setLoading(true);
        const result = await fetchInventarioCatalogPage(supabase, ctxSalonId, {
          search: filter,
          category,
          sottoscortaOnly: showOnlySottoscorta,
          page,
        });
        if (cancelled) return;
        setProducts(result.rows);
        setTotalCount(result.totalCount);
        setSottoscortaCount(result.sottoscortaCount);
        setPageCount(result.pageCount);
      } catch (e: unknown) {
        console.error("[inventario]", e);
        if (!cancelled) {
          setProducts([]);
          setTotalCount(0);
          setSottoscortaCount(0);
          setPageCount(1);
          setErrMsg(inventarioUserFacingMessage(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [isReady, ctxSalonId, filter, category, showOnlySottoscorta, page, isWarehouse, supabase]);

  const sortedProducts = useMemo(() => {
    if (!sortKey) return products;
    const list = [...products];
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
  }, [products, sortKey, sortDir]);

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
    a.download = `inventario-salone-${ctxSalonId}-pag${page}-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleRefresh() {
    if (ctxSalonId == null) return;
    try {
      setLoading(true);
      setErrMsg(null);
      const result = await fetchInventarioCatalogPage(supabase, ctxSalonId, {
        search: filter,
        category,
        sottoscortaOnly: showOnlySottoscorta,
        page,
      });
      setProducts(result.rows);
      setTotalCount(result.totalCount);
      setSottoscortaCount(result.sottoscortaCount);
      setPageCount(result.pageCount);
    } catch (e: unknown) {
      console.error("[inventario]", e);
      setErrMsg(inventarioUserFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (!isReady || loading) {
    return <div className="px-4 py-6 md:px-6 text-white/70 text-sm">Caricamento…</div>;
  }

  if (errMsg) {
    return (
      <div className="px-4 py-6 md:px-6 text-white space-y-2">
        <h1 className="text-xl font-semibold text-[#f3d8b6]">Inventario</h1>
        <p className="text-sm text-white/70">{errMsg}</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-4 md:px-5 md:py-5 text-white space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl md:text-2xl font-semibold text-[#f3d8b6] tracking-tight">
            Inventario
          </h1>
          <p className="text-sm text-white/50 truncate">{salonName}</p>
          <p className="text-sm text-white/70 tabular-nums">
            <span className="text-[#f3d8b6] font-semibold">{totalCount}</span>
            {" prodotti"}
            <span className="mx-2 text-white/25" aria-hidden>
              ·
            </span>
            <span className={sottoscortaCount > 0 ? "text-red-400 font-semibold" : "text-white/70"}>
              {sottoscortaCount}
            </span>
            {` sottoscorta (≤${INVENTARIO_SOTTOSORTA_THRESHOLD})`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" className={ghostBtn} onClick={() => window.print()}>
            Stampa
          </button>
          <button
            type="button"
            title={`CSV della pagina ${page}`}
            className={ghostBtn}
            onClick={handleExportCsv}
          >
            CSV pagina
          </button>
          <button type="button" className={ghostBtn} onClick={handleRefresh}>
            Aggiorna
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 rounded-xl border border-white/[0.08] bg-scz-dark/80 p-2.5">
        <label className="sr-only" htmlFor="inv-search">
          Cerca prodotto
        </label>
        <input
          id="inv-search"
          className={`${fieldClass} sm:flex-1 sm:min-w-[12rem]`}
          placeholder="Cerca nome o barcode…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        />
        <label className="sr-only" htmlFor="inv-category">
          Categoria
        </label>
        <select
          id="inv-category"
          className={`${fieldClass} sm:w-48`}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tutte le categorie</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 px-2 py-2 text-sm text-white/80 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showOnlySottoscorta}
            onChange={(e) => {
              setShowOnlySottoscorta(e.target.checked);
              setPage(1);
            }}
            className="rounded border-white/30 bg-black/30 text-[#f3d8b6] focus:ring-[#f3d8b6]/50"
          />
          Solo sottoscorta
        </label>
      </div>

      <div className="md:hidden divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-scz-dark overflow-hidden">
        {sortedProducts.map((p) => {
          const low = p.quantity <= INVENTARIO_SOTTOSORTA_THRESHOLD;
          return (
            <div key={p.product_id} className="px-3 py-2.5 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/magazzino/prodotto/${p.product_id}`}
                    className="font-medium text-white/95 hover:text-[#f3d8b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded"
                  >
                    {p.name}
                  </Link>
                  <p className="text-xs text-white/40 mt-0.5 truncate">
                    {[p.category, p.barcode].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-base font-semibold tabular-nums ${
                    low ? "text-red-400" : "text-[#f3d8b6]"
                  }`}
                >
                  {p.quantity}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {canCarico ? (
                  <Link
                    href={`/dashboard/magazzino/carico?product=${p.product_id}`}
                    className="text-emerald-400/90 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/50 rounded"
                  >
                    Carico
                  </Link>
                ) : null}
                <Link
                  href={`/dashboard/magazzino/scarico?product=${p.product_id}`}
                  className="text-[#f3d8b6] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded"
                >
                  Scarico
                </Link>
                {isWarehouse ? (
                  <>
                    <Link
                      href={`/dashboard/magazzino/prodotto/${p.product_id}/modifica`}
                      className="text-white/45 hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded"
                    >
                      Modifica
                    </Link>
                    <Link
                      href={`/dashboard/magazzino/prodotto/${p.product_id}/qr`}
                      className="text-white/45 hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded"
                    >
                      QR
                    </Link>
                  </>
                ) : (
                  <Link
                    href={`/dashboard/magazzino/prodotto/${p.product_id}`}
                    className="text-white/45 hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded"
                  >
                    Dettaglio
                  </Link>
                )}
              </div>
            </div>
          );
        })}
        {sortedProducts.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-white/45">
            Nessun prodotto con i filtri attuali.
          </p>
        ) : null}
      </div>

      <div className="hidden md:block overflow-x-auto rounded-xl border border-white/[0.08] bg-scz-dark">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-white/45">
              <th className="px-3 py-2 font-medium">
                <SortBtn label="Prodotto" active={sortKey === "name"} dir={sortDir} onClick={() => handleSort("name")} />
              </th>
              <th className="px-3 py-2 font-medium">
                <SortBtn label="Categoria" active={sortKey === "category"} dir={sortDir} onClick={() => handleSort("category")} />
              </th>
              <th className="px-3 py-2 font-medium">Barcode</th>
              <th className="px-3 py-2 font-medium">
                <SortBtn label="Giacenza" active={sortKey === "quantity"} dir={sortDir} onClick={() => handleSort("quantity")} />
              </th>
              <th className="px-3 py-2 font-medium text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((p) => {
              const low = p.quantity <= INVENTARIO_SOTTOSORTA_THRESHOLD;
              return (
                <tr key={p.product_id} className="border-b border-white/[0.05] hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/magazzino/prodotto/${p.product_id}`}
                      className="font-medium text-white/95 hover:text-[#f3d8b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-white/55">{p.category ?? "—"}</td>
                  <td className="px-3 py-2 text-white/45 tabular-nums">{p.barcode || "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-baseline gap-2 tabular-nums font-semibold ${
                        low ? "text-red-400" : "text-[#f3d8b6]"
                      }`}
                    >
                      {p.quantity}
                      {low ? <span className="text-[11px] font-medium text-red-400/80">sottoscorta</span> : null}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <RowActions productId={p.product_id} canCarico={canCarico} isWarehouse={isWarehouse} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedProducts.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-white/45">Nessun prodotto con i filtri attuali.</p>
        ) : null}
      </div>

      {totalCount > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-white/45 px-0.5">
          <p className="tabular-nums">
            Pagina {page} di {pageCount} · {INVENTARIO_PAGE_SIZE} per pagina
          </p>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} className={ghostBtn} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Precedente
              </button>
              <button type="button" disabled={page >= pageCount} className={ghostBtn} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                Successiva
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SortBtn({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded"
    >
      {label}
      {active ? (dir === "asc" ? <ChevronUp className="w-3.5 h-3.5" aria-hidden /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden />) : null}
    </button>
  );
}

function RowActions({
  productId,
  canCarico,
  isWarehouse,
}: {
  productId: number;
  canCarico: boolean;
  isWarehouse: boolean;
}) {
  const link =
    "text-xs text-[#f3d8b6]/90 hover:text-[#f3d8b6] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded";

  return (
    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
      {canCarico ? (
        <Link href={`/dashboard/magazzino/carico?product=${productId}`} className={link}>
          Carico
        </Link>
      ) : null}
      <Link href={`/dashboard/magazzino/scarico?product=${productId}`} className={link}>
        Scarico
      </Link>
      {isWarehouse ? (
        <details className="relative">
          <summary
            className="list-none cursor-pointer inline-flex items-center gap-1 text-xs text-white/45 hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded [&::-webkit-details-marker]:hidden"
            aria-label="Altre azioni"
          >
            <MoreHorizontal size={14} aria-hidden />
            Altro
          </summary>
          <div className="absolute right-0 z-20 mt-1 min-w-[8.5rem] rounded-lg border border-white/10 bg-[#1b0d08] py-1 shadow-lg">
            <Link href={`/dashboard/magazzino/prodotto/${productId}/modifica`} className="block px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.06]">
              Modifica
            </Link>
            <Link href={`/dashboard/magazzino/prodotto/${productId}/qr`} className="block px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.06]">
              QR
            </Link>
            <Link href={`/dashboard/magazzino/prodotto/${productId}`} className="block px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.06]">
              Dettaglio
            </Link>
          </div>
        </details>
      ) : (
        <Link href={`/dashboard/magazzino/prodotto/${productId}`} className={link}>
          Dettaglio
        </Link>
      )}
    </div>
  );
}
