"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Zap,
  Repeat,
  History,
  Plus,
  AlertTriangle,
  LayoutList,
  Package,
} from "lucide-react";
import { motion } from "framer-motion";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

type Role = "coordinator" | "magazzino" | "reception" | "cliente" | string;

export default function MagazzinoPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role, activeSalonId, isReady, receptionSalonId, allowedSalons } = useActiveSalon();

  const [productCount, setProductCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);

  const isWarehouse = role === "magazzino" || role === "coordinator";
  const isReception = role === "reception";
  const effectiveSalonId = isWarehouse
    ? activeSalonId
    : isReception
      ? receptionSalonId
      : activeSalonId;

  // Conteggio prodotti per il salone attivo (warehouse = switcher; reception = staff.salon_id)
  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      if (!isReady) return;

      if (effectiveSalonId == null) {
        setProductCount(null);
        setLoadingCount(false);
        return;
      }

      try {
        setLoadingCount(true);
        setProductCount(null);

        const { count, error } = await supabase
          .from("products_with_stock")
          .select("*", { count: "exact", head: true })
          .eq("salon_id", effectiveSalonId);

        if (cancelled) return;

        if (error) {
          console.error(error);
          setProductCount(0);
        } else {
          setProductCount(count ?? 0);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setProductCount(0);
      } finally {
        if (!cancelled) setLoadingCount(false);
      }
    }

    loadCount();
    return () => {
      cancelled = true;
    };
  }, [supabase, isReady, effectiveSalonId]);

  function Card({
    href,
    icon: Icon,
    title,
    subtitle,
  }: {
    href: string;
    icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
    title: string;
    subtitle: string;
  }) {
    return (
      <Link href={href}>
        <motion.div
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="rounded-2xl border border-white/10 bg-scz-dark p-6 md:p-7 cursor-pointer select-none hover:bg-black/30 hover:border-white/20 transition"
        >
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-xl p-2.5 bg-black/30 border border-white/10">
              <Icon size={26} className="text-[#f3d8b6]" strokeWidth={1.7} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-lg text-white">{title}</div>
              <div className="text-sm text-white/60 mt-1">{subtitle}</div>
            </div>
          </div>
        </motion.div>
      </Link>
    );
  }

  const contextLabel =
    effectiveSalonId === MAGAZZINO_CENTRALE_ID
      ? "Magazzino Centrale"
      : effectiveSalonId == null
        ? "—"
        : allowedSalons.find((s) => s.id === effectiveSalonId)?.name ?? `Salone ${effectiveSalonId}`;

  const countLabel =
    !isReady || loadingCount
      ? "Caricamento..."
      : effectiveSalonId == null
        ? "—"
        : productCount == null
          ? "Caricamento..."
          : `${productCount} prodotti`;

  const showMissingSalonBanner =
    isReady && !isWarehouse && (isReception ? receptionSalonId == null : activeSalonId == null);

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white space-y-6">
      <div className="rounded-3xl border border-white/10 bg-scz-dark shadow-[0_0_60px_rgba(0,0,0,0.25)] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 md:p-7 bg-black/20 border-b border-white/10">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl p-3 bg-black/30 border border-white/10">
              <Package className="text-[#f3d8b6]" size={28} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
                Modulo
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                Magazzino
              </h1>
              <p className="text-white/60 mt-1">
                Carichi, scarichi, trasferimenti e inventario per{" "}
                <span className="font-semibold text-white/90">{contextLabel}</span>
              </p>
              <p className="text-white/50 text-sm mt-1">
                {isWarehouse
                  ? "Cambia salone dallo switcher in alto."
                  : "Operazioni sul tuo salone."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showMissingSalonBanner && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3 items-start">
          <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-amber-200/90">
            <div className="font-semibold">
              Questo utente non ha un salone associato
            </div>
            <div className="opacity-90 mt-0.5">
              Contatta l’amministratore per assegnare il salone all’account reception.
            </div>
          </div>
        </div>
      )}

      {isWarehouse && (
        <Link
          href="/dashboard/magazzino/nuovo-prodotto"
          className="inline-flex items-center gap-2 rounded-xl px-5 py-3 bg-emerald-600/90 border border-emerald-500/30 text-white font-bold hover:bg-emerald-500 transition"
        >
          <Plus size={20} strokeWidth={2} />
          Nuovo Prodotto
        </Link>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <Card href="/dashboard/magazzino/carico" icon={ArrowDown} title="Carico" subtitle={countLabel} />
        <Card href="/dashboard/magazzino/scarico" icon={ArrowUp} title="Scarico" subtitle={countLabel} />
        <Card href="/dashboard/magazzino/rapida" icon={Zap} title="Rapida" subtitle="Scarico veloce −1" />
        <Card href="/dashboard/magazzino/trasferimenti" icon={Repeat} title="Trasferimenti" subtitle={countLabel} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        <Card href="/dashboard/magazzino/movimenti" icon={History} title="Movimenti" subtitle="Storico movimenti" />
        <Card href="/dashboard/magazzino/inventario" icon={LayoutList} title="Inventario" subtitle="Giacenze e prodotti" />
      </div>
    </div>
  );
}
