"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { Repeat, ArrowLeft, Package, ArrowRightCircle, AlertCircle } from "lucide-react";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID, toSalonId } from "@/lib/constants";
import { toast } from "sonner";

interface ProductRow {
  product_id: number;
  name: string;
  quantity: number;
}

interface SelectedItem {
  product_id: number;
  name: string;
  qty: number;
}

const SALONI = [
  { id: 1, name: "Scaramuzzo Corigliano" },
  { id: 2, name: "Scaramuzzo Cosenza" },
  { id: 3, name: "Scaramuzzo Castrovillari" },
  { id: 4, name: "Scaramuzzo Roma" },
  { id: 5, name: "Magazzino Centrale" },
];

export default function TrasferimentiPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role, activeSalonId, isReady, allowedSalons, receptionSalonId } = useActiveSalon();

  const [userSalonId, setUserSalonId] = useState<number | null>(null);

  const [fromSalon, setFromSalon] = useState<number | null>(null);
  const [toSalon, setToSalon] = useState<number>(1);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isWarehouse = role === "magazzino" || role === "coordinator";
  const isReception = role === "reception";
  const disableFromSelect = !isWarehouse; // reception: "Da" fisso

  const toOptions = useMemo(() => {
    if (fromSalon === null) return SALONI.filter((s) => s.id !== MAGAZZINO_CENTRALE_ID);
    return SALONI.filter((s) => s.id !== fromSalon);
  }, [fromSalon]);

  function pickDefaultTo(from: number | null) {
    if (from === null) return 1;

    // preferisci sempre un salone reale (1..4) diverso da from
    const firstReal =
      SALONI.find((x) => x.id !== from && x.id !== MAGAZZINO_CENTRALE_ID)?.id ?? 1;

    // se from è un salone reale, ok; se from è centrale 5, firstReal sarà 1
    return firstReal;
  }

  async function fetchProducts(salonId: number) {
    const { data, error } = await supabase
      .from("products_with_stock")
      .select("product_id,name,quantity")
      .eq("salon_id", salonId)
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      setProducts([]);
      return;
    }

    setProducts(((data as ProductRow[]) ?? []).filter((p) => (p.quantity ?? 0) > 0));
  }

  // Inizializzazione from/to: reception usa receptionSalonId (staff.salon_id), non user_metadata
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isReady) return;

      try {
        setLoading(true);

        if (isWarehouse) {
          const defaultFrom = activeSalonId ?? MAGAZZINO_CENTRALE_ID;
          if (cancelled) return;
          setFromSalon(defaultFrom);
          setToSalon(pickDefaultTo(defaultFrom));
          setSelected([]);
          if (defaultFrom != null) await fetchProducts(defaultFrom);
          else setProducts([]);
          return;
        }

        if (isReception) {
          const defaultFrom = receptionSalonId ?? null;
          if (cancelled) return;
          setUserSalonId(defaultFrom);
          setFromSalon(defaultFrom);
          setToSalon(pickDefaultTo(defaultFrom));
          setSelected([]);
          if (defaultFrom != null) await fetchProducts(defaultFrom);
          else setProducts([]);
          return;
        }

        // cliente: ancora da metadata
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const user = data.user;
        if (!user) return;
        const sid = toSalonId(user.user_metadata?.salon_id ?? null);
        if (cancelled) return;
        setUserSalonId(sid);
        setFromSalon(sid);
        setToSalon(pickDefaultTo(sid));
        setSelected([]);
        if (sid != null) await fetchProducts(sid);
        else setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, isReady, isWarehouse, isReception, activeSalonId, receptionSalonId]);

  // se warehouse cambia vista dall’header => cambia FROM
  useEffect(() => {
    if (!isReady) return;
    if (loading) return;
    if (!isWarehouse) return;

    const v = activeSalonId ?? MAGAZZINO_CENTRALE_ID;
    if (fromSalon === v) return;

    setFromSalon(v);
    const firstTo = pickDefaultTo(v);
    setToSalon(firstTo);
    setSelected([]);
    fetchProducts(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSalonId, isReady, loading, isWarehouse]);

  function add(prod: ProductRow) {
    setSelected((prev) => {
      const existing = prev.find((x) => x.product_id === prod.product_id);
      if (existing) {
        return prev.map((x) =>
          x.product_id === prod.product_id ? { ...x, qty: x.qty + 1 } : x
        );
      }
      return [...prev, { product_id: prod.product_id, name: prod.name, qty: 1 }];
    });
  }

  function changeQty(product_id: number, qty: number) {
    const safe = Number.isFinite(qty) ? qty : 1;
    setSelected((prev) =>
      prev
        .map((p) => (p.product_id === product_id ? { ...p, qty: safe } : p))
        .filter((p) => p.qty > 0)
    );
  }

  function maxFor(product_id: number) {
    return products.find((p) => p.product_id === product_id)?.quantity ?? 0;
  }

  async function completa() {
    if (fromSalon === null) return;
    if (!selected.length) return;
    if (fromSalon === toSalon) return;

    if (role === "cliente") {
      toast.error("Non puoi eseguire trasferimenti.");
      return;
    }

    // valida qty vs giacenza
    for (const it of selected) {
      const max = maxFor(it.product_id);
      if (it.qty <= 0 || it.qty > max) {
        toast.error(`Quantità non valida per "${it.name}" (max ${max})`);
        return;
      }
    }

    const res = await fetch("/api/magazzino/trasferimenti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromSalon,
        toSalon,
        items: selected.map((x) => ({ id: x.product_id, qty: x.qty })),
        executeNow: true,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || json?.error) {
      console.error(json);
      toast.error(json?.error || "Errore trasferimento");
      return;
    }

    toast.success("Trasferimento completato!");
    setSelected([]);
    await fetchProducts(fromSalon);
  }

  const fromName =
    fromSalon != null
      ? allowedSalons.find((s) => s.id === fromSalon)?.name ??
        SALONI.find((s) => s.id === fromSalon)?.name ??
        `Salone ${fromSalon}`
      : "—";
  const toName =
    toOptions.find((s) => s.id === toSalon)?.name ?? SALONI.find((s) => s.id === toSalon)?.name ?? `Salone ${toSalon}`;

  // reception senza salone (staff.salon_id) = blocco; cliente senza metadata = blocco
  if (!loading && !isWarehouse && (isReception ? receptionSalonId === null : userSalonId === null)) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 flex gap-4 items-start max-w-xl">
          <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={24} />
          <div>
            <h1 className="text-xl font-bold text-[#f3d8b6] mb-2">Trasferimenti</h1>
            <p className="text-white/80">
          Questo utente non ha un <b>salon_id</b> associato. Contatta l’amministratore.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isReady || loading || fromSalon === null) {
    return (
      <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white flex items-center justify-center">
        <div className="flex items-center gap-2 text-white/60">
          <span className="inline-block w-5 h-5 border-2 border-[#f3d8b6]/40 border-t-[#f3d8b6] rounded-full animate-spin" />
          Caricamento…
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white space-y-6">
      {/* HERO */}
      <div className="rounded-3xl border border-white/10 bg-scz-dark shadow-[0_0_60px_rgba(0,0,0,0.25)] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 md:p-7 bg-black/20 border-b border-white/10">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl p-3 bg-black/30 border border-white/10">
              <Repeat className="text-[#f3d8b6]" size={28} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
                Magazzino
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                Trasferimenti
              </h1>
              <p className="text-white/60 mt-1">
                Sposta merce da <span className="font-semibold text-white/90">{fromName}</span> verso la destinazione scelta.
              </p>
              <p className="text-white/50 text-sm mt-1">
                {isWarehouse
                  ? "Cambia salone Da dallo switcher in alto."
                  : "Il tuo salone è fisso come origine. Scegli solo la destinazione."}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/magazzino"
            className="shrink-0 self-start sm:self-center inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 bg-black/30 border border-white/10 text-[#f3d8b6] font-semibold hover:bg-black/40 transition"
          >
            <ArrowLeft size={18} />
            Indietro
          </Link>
        </div>
      </div>

      {/* DA / A */}
      <div className="rounded-2xl border border-white/10 bg-scz-dark p-4 md:p-5 space-y-4">
        <div className="text-[10px] font-black uppercase tracking-wider text-white/50">
          Percorso
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">Da</label>
            {isReception ? (
              <div className="p-3 rounded-xl bg-black/30 border border-white/10 text-[#f3d8b6] font-semibold">
                {fromName}
              </div>
            ) : (
              <select
                className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30 disabled:opacity-60"
                value={fromSalon ?? ""}
                disabled={disableFromSelect}
                onChange={async (e) => {
                  const v = Number(e.target.value);
                  setFromSalon(v);
                  const firstTo = pickDefaultTo(v);
                  setToSalon(firstTo);
                  setSelected([]);
                  await fetchProducts(v);
                }}
              >
                {SALONI.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {isReception && (
              <p className="text-xs text-white/50 mt-1.5">Il tuo salone (fisso)</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">A</label>
            <select
              className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30"
              value={toSalon}
              onChange={(e) => setToSalon(Number(e.target.value))}
            >
              {toOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* DISPONIBILI + TRASFERITI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-scz-dark overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-2">
            <Package className="text-[#f3d8b6]" size={20} strokeWidth={1.7} />
            <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
              Disponibili
            </span>
          </div>
          <div className="p-4 max-h-[360px] overflow-y-auto">
            {products.length > 0 ? (
              <ul className="space-y-0 divide-y divide-white/10">
                {products.map((p) => (
                  <li key={p.product_id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white truncate">{p.name}</p>
                      <p className="text-xs text-white/50 mt-0.5">{p.quantity} disponibili</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-[#f3d8b6]/20 border border-[#f3d8b6]/40 text-[#f3d8b6] text-sm font-semibold hover:bg-[#f3d8b6]/30 transition"
                      onClick={() => add(p)}
                    >
                      Aggiungi
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="text-white/25 mb-2" size={32} strokeWidth={1.5} />
                <p className="text-white/50 text-sm">Nessun prodotto disponibile</p>
                <p className="text-white/40 text-xs mt-1">Scegli un altro salone Da o attendi carichi.</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-scz-dark overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-2">
            <ArrowRightCircle className="text-[#f3d8b6]" size={20} strokeWidth={1.7} />
            <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
              In trasferimento
            </span>
          </div>
          <div className="p-4 max-h-[360px] overflow-y-auto space-y-4">
            {selected.length > 0 ? (
              <>
                <ul className="space-y-0 divide-y divide-white/10">
                  {selected.map((s) => {
                    const max = maxFor(s.product_id);
                    return (
                      <li key={s.product_id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-white truncate">{s.name}</p>
                          <p className="text-xs text-white/50">max {max}</p>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={max}
                          className="w-20 px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-white text-sm text-right focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30"
                          value={s.qty}
                          onChange={(e) => changeQty(s.product_id, Number(e.target.value))}
                        />
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base transition disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={completa}
                  disabled={!selected.length || fromSalon === toSalon || role === "cliente"}
                >
                  Completa Trasferimento → {toName}
                </button>
                {isReception && (
                  <p className="text-xs text-white/50">
                    Da = tuo salone (fisso). Destinazione in A.
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ArrowRightCircle className="text-white/25 mb-2" size={32} strokeWidth={1.5} />
                <p className="text-white/50 text-sm">Nessun articolo selezionato</p>
                <p className="text-white/40 text-xs mt-1">Aggiungi prodotti dalla colonna Disponibili.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
