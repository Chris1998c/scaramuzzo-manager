"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { ArrowDown, ArrowUp, Zap, Repeat, History, Plus } from "lucide-react";
import { motion } from "framer-motion";

export default function MagazzinoPage() {
  const supabase = createClient();

  const [role, setRole] = useState<string>("salone");
  const [salonId, setSalonId] = useState<number | null>(null);
  const [productCount, setProductCount] = useState<number>(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;

        const { user } = await res.json();
        if (!user) return;

        const r = user.user_metadata?.role ?? "salone";
        const sRaw = user.user_metadata?.salon_id ?? null;
        const s = sRaw === null ? null : typeof sRaw === "number" ? sRaw : Number(sRaw);

        setRole(r);
        setSalonId(s);

        if (s !== null) await fetchCount(s);
      } catch (err) {
        console.error("Errore load user", err);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchCount(salon: number) {
    const { count, error } = await supabase
      .from("products_with_stock")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salon);

    if (error) {
      console.error(error);
      setProductCount(0);
      return;
    }

    setProductCount(count ?? 0);
  }

  if (salonId === null) return null;

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
          whileHover={{ scale: 1.05, boxShadow: "0 10px 40px rgba(0,0,0,0.35)" }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          className="bg-[#FDF8F3] text-[#341A09] rounded-3xl p-8 shadow-lg cursor-pointer select-none"
        >
          <Icon size={46} className="mb-4 mx-auto" strokeWidth={1.7} />
          <div className="text-center font-bold text-xl">{title}</div>
          <div className="text-center text-sm opacity-60 mt-1">{subtitle}</div>
        </motion.div>
      </Link>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3]">
      <h1 className="text-4xl font-extrabold mb-3 text-[#B88A54]">Magazzino</h1>
      <p className="opacity-70 mb-10">Gestione completa di carichi, scarichi, movimenti e azioni rapide.</p>

      {(role === "magazzino" || role === "coordinator") && (
        <div className="mb-12 flex justify-start">
          <Link
            href="/dashboard/magazzino/nuovo-prodotto"
            className="flex items-center gap-3 bg-[#0FA958] px-6 py-4 rounded-2xl text-white text-xl font-bold shadow-xl hover:scale-105 transition"
          >
            <Plus size={28} strokeWidth={2} />
            Nuovo Prodotto
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <Card
          href="/dashboard/magazzino/inventario"
          icon={ArrowDown}
          title="Carico"
          subtitle={`${productCount} prodotti`}
        />

        <Card
          href="/dashboard/magazzino/inventario"
          icon={ArrowUp}
          title="Scarico"
          subtitle={`${productCount} prodotti`}
        />

        <Card href="/dashboard/magazzino/rapida" icon={Zap} title="Rapida" subtitle="Accesso veloce" />

        <Card
          href="/dashboard/magazzino/trasferimenti"
          icon={Repeat}
          title="Trasferimenti"
          subtitle={`${productCount} prodotti`}
        />
      </div>

      <div className="mt-14">
        <Card href="/dashboard/magazzino/movimenti" icon={History} title="Movimenti" subtitle="Storico aggiornato" />
      </div>
    </div>
  );
}
