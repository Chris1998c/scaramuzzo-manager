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
} from "lucide-react";
import { motion } from "framer-motion";
import { useUI, MAGAZZINO_CENTRALE_ID } from "@/lib/ui-store";

type Role = "coordinator" | "magazzino" | "reception" | "cliente" | string;

function toSalonId(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null; // accetta 0
}

export default function MagazzinoPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId } = useUI(); // SEMPRE number (0..4)

  const [role, setRole] = useState<Role>("reception");
  const [userSalonId, setUserSalonId] = useState<number | null>(null);

  // ctx definitivo: number (0 = Magazzino Centrale reale). -1 solo per bloccare reception senza salon_id.
  const [ctxSalonId, setCtxSalonId] = useState<number>(MAGAZZINO_CENTRALE_ID);

  const [productCount, setProductCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // ---------------------------
  // LOAD USER + CONTEXT
  // ---------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        setLoading(true);

        // 1) /api/auth/me (se esiste)
        let user: any = null;
        try {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            user = json?.user ?? null;
          }
        } catch {
          // ignore
        }

        // 2) fallback supabase
        if (!user) {
          const { data, error } = await supabase.auth.getUser();
          if (error) throw error;
          user = data.user ?? null;
        }

        if (!user) {
          if (!cancelled) {
            setRole("reception");
            setUserSalonId(null);
            setCtxSalonId(MAGAZZINO_CENTRALE_ID);
            setProductCount(null);
          }
          return;
        }

        const r: Role = user.user_metadata?.role ?? "reception";
        const sid = toSalonId(user.user_metadata?.salon_id ?? null);

        if (cancelled) return;

        setRole(r);
        setUserSalonId(sid);

        const isWarehouse = r === "magazzino" || r === "coordinator";

        // CONTEXT DEFINITIVO:
        // - magazzino/coordinator -> ctx = activeSalonId (0 = Magazzino Centrale)
        // - reception/cliente -> ctx = userSalonId (obbligatorio)
        if (isWarehouse) {
          setCtxSalonId(
            Number.isFinite(activeSalonId) ? activeSalonId : MAGAZZINO_CENTRALE_ID
          );
        } else {
          setCtxSalonId(sid ?? -1);
        }
      } catch (err) {
        console.error("Errore load user", err);
        if (!cancelled) {
          setRole("reception");
          setUserSalonId(null);
          setCtxSalonId(MAGAZZINO_CENTRALE_ID);
          setProductCount(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // se cambia activeSalonId dall’header, aggiorna ctx (solo coordinator/magazzino)
  useEffect(() => {
    if (loading) return;
    const isWarehouse = role === "magazzino" || role === "coordinator";
    if (!isWarehouse) return;

    const v = Number.isFinite(activeSalonId) ? activeSalonId : MAGAZZINO_CENTRALE_ID;
    if (ctxSalonId !== v) setCtxSalonId(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSalonId, role, loading]);

  // ---------------------------
  // COUNT PRODUCTS (sempre per ctxSalonId, anche 0)
  // ---------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      if (loading) return;

      // reception senza salon_id -> niente conteggio
      if (ctxSalonId === -1) {
        setProductCount(null);
        return;
      }

      try {
        setProductCount(null);

        const { count, error } = await supabase
          .from("products_with_stock")
          .select("*", { count: "exact", head: true })
          .eq("salon_id", ctxSalonId); // ✅ anche 0

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
      }
    }

    loadCount();
    return () => {
      cancelled = true;
    };
  }, [supabase, ctxSalonId, loading]);

  // ---------------------------
  // UI
  // ---------------------------
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

  const isWarehouse = role === "magazzino" || role === "coordinator";

  const countLabel =
    loading
      ? "Caricamento..."
      : ctxSalonId === -1
      ? "—"
      : productCount === null
      ? "Caricamento..."
      : `${productCount} prodotti`;

  const showMissingSalonBanner =
    !loading && !isWarehouse && userSalonId === null;

  const contextLabel =
    ctxSalonId === MAGAZZINO_CENTRALE_ID
      ? "Magazzino Centrale"
      : `Salone ${ctxSalonId}`;

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-[#FDF8F3]">
      <h1 className="text-4xl font-extrabold mb-2 text-[#B88A54]">Magazzino</h1>
      <p className="opacity-70 mb-8">
        Gestione completa di carichi, scarichi, movimenti e azioni rapide.{" "}
        <span className="opacity-60">({contextLabel})</span>
      </p>

      {/* Banner SOLO se reception/cliente senza salon_id (problema reale) */}
      {showMissingSalonBanner && (
        <div className="mb-10 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 flex gap-3 items-start">
          <AlertTriangle className="mt-0.5" size={20} />
          <div className="text-sm">
            <div className="font-semibold text-yellow-200">
              Questo utente non ha un salon_id associato
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
        <Card
          href="/dashboard/magazzino/carico"
          icon={ArrowDown}
          title="Carico"
          subtitle={countLabel}
        />
        <Card
          href="/dashboard/magazzino/scarico"
          icon={ArrowUp}
          title="Scarico"
          subtitle={countLabel}
        />
        <Card
          href="/dashboard/magazzino/rapida"
          icon={Zap}
          title="Rapida"
          subtitle="Accesso veloce"
        />
        <Card
          href="/dashboard/magazzino/trasferimenti"
          icon={Repeat}
          title="Trasferimenti"
          subtitle={countLabel}
        />
      </div>

      <div className="mt-12">
        <Card
          href="/dashboard/magazzino/movimenti"
          icon={History}
          title="Movimenti"
          subtitle="Storico aggiornato"
        />
      </div>
    </div>
  );
}
