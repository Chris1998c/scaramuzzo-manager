"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { ArrowDown, ArrowUp, Zap, Repeat, History, Plus, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

type Role = "coordinator" | "magazzino" | "reception" | "cliente" | string;

export default function MagazzinoPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role, activeSalonId, isReady } = useActiveSalon();

  const [productCount, setProductCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);

  const isWarehouse = role === "magazzino" || role === "coordinator";

  // Conteggio prodotti per il salone attivo (incluso centrale=5)
  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      if (!isReady) return;

      // reception senza salone valido => niente
      if (activeSalonId == null) {
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
          .eq("salon_id", activeSalonId);

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
  }, [supabase, isReady, activeSalonId]);

  function Card({
    href,
    icon: Icon,
    title,
    subtitle,
  }: {
    href: string;
    icon: any;
    title: string;
    subtitle: string;
  }) {
    return (
      <Link href={href}>
        <motion.div
          whileHover={{ scale: 1.04, boxShadow: "0 10px 40px rgba(0,0,0,0.35)" }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="bg-[#FDF8F3] text-[#341A09] rounded-3xl p-8 shadow-lg cursor-pointer select-none"
        >
          <Icon size={46} className="mb-4 mx-auto" strokeWidth={1.7} />
          <div className="text-center font-bold text-xl">{title}</div>
          <div className="text-center text-sm opacity-60 mt-1">{subtitle}</div>
        </motion.div>
      </Link>
    );
  }

  const contextLabel =
    activeSalonId === MAGAZZINO_CENTRALE_ID
      ? "Magazzino Centrale"
      : activeSalonId == null
      ? "—"
      : `Salone ${activeSalonId}`;

  const countLabel =
    !isReady || loadingCount
      ? "Caricamento..."
      : activeSalonId == null
      ? "—"
      : productCount == null
      ? "Caricamento..."
      : `${productCount} prodotti`;

  const showMissingSalonBanner = isReady && !isWarehouse && activeSalonId == null;

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3]">
      <h1 className="text-4xl font-extrabold mb-2 text-[#B88A54]">Magazzino</h1>
      <p className="opacity-70 mb-8">
        Gestione completa di carichi, scarichi, movimenti e azioni rapide.{" "}
        <span className="opacity-60">({contextLabel})</span>
      </p>

      {/* Banner SOLO se reception/cliente senza salon_id */}
      {showMissingSalonBanner && (
        <div className="mb-10 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 flex gap-3 items-start">
          <AlertTriangle className="mt-0.5" size={20} />
          <div className="text-sm">
            <div className="font-semibold text-yellow-200">
              Questo utente non ha un salone associato
            </div>
            <div className="opacity-80">
              Contatta l’amministratore per assegnare il salone all’account reception.
            </div>
          </div>
        </div>
      )}

      {isWarehouse && (
        <div className="mb-10 flex justify-start">
          <Link
            href="/dashboard/magazzino/nuovo-prodotto"
            className="flex items-center gap-3 bg-[#0FA958] px-6 py-4 rounded-2xl text-white text-xl font-bold shadow-xl hover:scale-[1.03] transition"
          >
            <Plus size={28} strokeWidth={2} />
            Nuovo Prodotto
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8">
        <Card href="/dashboard/magazzino/carico" icon={ArrowDown} title="Carico" subtitle={countLabel} />
        <Card href="/dashboard/magazzino/scarico" icon={ArrowUp} title="Scarico" subtitle={countLabel} />
        <Card href="/dashboard/magazzino/rapida" icon={Zap} title="Rapida" subtitle="Accesso veloce" />
        <Card href="/dashboard/magazzino/trasferimenti" icon={Repeat} title="Trasferimenti" subtitle={countLabel} />
      </div>

      <div className="mt-12">
        <Card href="/dashboard/magazzino/movimenti" icon={History} title="Movimenti" subtitle="Storico aggiornato" />
      </div>
    </div>
  );
}
