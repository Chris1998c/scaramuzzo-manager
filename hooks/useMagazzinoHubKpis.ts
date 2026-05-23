"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchInventarioCatalogPage } from "@/lib/magazzino/inventarioCatalog";

export type MagazzinoHubKpis = {
  stockValueEstimate: number | null;
  totalProducts: number | null;
  sottoscortaCount: number | null;
  movementsToday: number | null;
  transfersRecent: number | null;
  loading: boolean;
  unavailable: boolean;
};

function todayBounds(): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  return {
    from: `${today}T00:00:00`,
    to: `${today}T23:59:59.999`,
  };
}

function weekAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

export function useMagazzinoHubKpis(
  supabase: SupabaseClient,
  salonId: number | null,
  isReady: boolean,
): MagazzinoHubKpis {
  const [stockValueEstimate, setStockValueEstimate] = useState<number | null>(null);
  const [totalProducts, setTotalProducts] = useState<number | null>(null);
  const [sottoscortaCount, setSottoscortaCount] = useState<number | null>(null);
  const [movementsToday, setMovementsToday] = useState<number | null>(null);
  const [transfersRecent, setTransfersRecent] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isReady) return;

      if (salonId == null) {
        setStockValueEstimate(null);
        setTotalProducts(null);
        setSottoscortaCount(null);
        setMovementsToday(null);
        setTransfersRecent(null);
        setLoading(false);
        setUnavailable(false);
        return;
      }

      try {
        setLoading(true);
        setUnavailable(false);

        const { from, to } = todayBounds();
        const weekAgo = weekAgoIso();

        const [stockRows, catalog, movToday, transfers] = await Promise.all([
          supabase
            .from("products_with_stock")
            .select("quantity, cost")
            .eq("salon_id", salonId),
          fetchInventarioCatalogPage(supabase, salonId, {
            search: "",
            category: "",
            sottoscortaOnly: false,
            page: 1,
          }),
          supabase
            .from("movimenti_view")
            .select("*", { count: "exact", head: true })
            .or(`from_salon.eq.${salonId},to_salon.eq.${salonId}`)
            .gte("created_at", from)
            .lte("created_at", to),
          supabase
            .from("transfers_list_view")
            .select("*", { count: "exact", head: true })
            .or(`from_salon.eq.${salonId},to_salon.eq.${salonId}`)
            .gte("created_at", weekAgo),
        ]);

        if (cancelled) return;

        if (stockRows.error || movToday.error || transfers.error) {
          console.error(stockRows.error || movToday.error || transfers.error);
          setUnavailable(true);
        }

        const value = (stockRows.data ?? []).reduce((acc, row) => {
          const qty = Number(row.quantity) || 0;
          const cost = Number(row.cost) || 0;
          return acc + qty * cost;
        }, 0);

        setStockValueEstimate(value);
        setTotalProducts(catalog.totalCount);
        setSottoscortaCount(catalog.sottoscortaCount);
        setMovementsToday(movToday.count ?? 0);
        setTransfersRecent(transfers.count ?? 0);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setUnavailable(true);
          setStockValueEstimate(null);
          setTotalProducts(null);
          setSottoscortaCount(null);
          setMovementsToday(null);
          setTransfersRecent(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, salonId, isReady]);

  return useMemo(
    () => ({
      stockValueEstimate,
      totalProducts,
      sottoscortaCount,
      movementsToday,
      transfersRecent,
      loading,
      unavailable,
    }),
    [
      stockValueEstimate,
      totalProducts,
      sottoscortaCount,
      movementsToday,
      transfersRecent,
      loading,
      unavailable,
    ],
  );
}
