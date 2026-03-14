"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { toast } from "sonner";
import { Zap, ArrowLeft, Search, PackageMinus, AlertCircle } from "lucide-react";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

interface Product {
  product_id: number;
  name: string;
  quantity: number;
}

function salonLabel(id: number) {
  if (id === MAGAZZINO_CENTRALE_ID) return "Magazzino Centrale";
  return `Salone ${id}`;
}

export default function RapidaPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role, activeSalonId, isReady, receptionSalonId, allowedSalons } = useActiveSalon();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [scaricandoId, setScaricandoId] = useState<number | null>(null);

  const isReception = role === "reception";
  const isWarehouse = role === "magazzino" || role === "coordinator";
  const salonId = isReady
    ? (isReception
        ? (receptionSalonId != null && receptionSalonId >= 1 ? receptionSalonId : null)
        : (activeSalonId != null && activeSalonId >= 1 ? activeSalonId : null))
    : null;

  const salonName =
    salonId != null
      ? allowedSalons.find((s) => s.id === salonId)?.name ?? salonLabel(salonId)
      : "—";

  async function search() {
    if (!salonId || !query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products_with_stock")
        .select("product_id, name, quantity")
        .eq("salon_id", salonId)
        .ilike("name", `%${query.trim()}%`)
        .order("name");

      if (error) throw error;
      setResults((data as Product[]) || []);
    } catch (e) {
      console.error(e);
      toast.error("Errore nel caricamento prodotti.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function scarica(productId: number) {
    if (scaricandoId != null) return;

    setScaricandoId(productId);
    try {
      const res = await fetch("/api/magazzino/rapida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          qty: 1,
          ...(salonId != null && { salonId }),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json?.error ?? "Errore durante lo scarico.");
        return;
      }

      toast.success("Scarico registrato.");
      await search();
    } catch (e) {
      console.error(e);
      toast.error("Errore di rete.");
    } finally {
      setScaricandoId(null);
    }
  }

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white space-y-6">
      {/* HERO */}
      <div className="rounded-3xl border border-white/10 bg-scz-dark shadow-[0_0_60px_rgba(0,0,0,0.25)] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 md:p-7 bg-black/20 border-b border-white/10">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl p-3 bg-black/30 border border-white/10">
              <Zap className="text-[#f3d8b6]" size={28} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
                Magazzino
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                Scarico rapido
              </h1>
              <p className="text-white/60 mt-1">
                Cerca e scarica −1 dalla giacenza di{" "}
                <span className="font-semibold text-white/90">{salonName}</span>
              </p>
              <p className="text-white/50 text-sm mt-1">
                {isWarehouse
                  ? "Cambia salone dallo switcher in alto."
                  : "Scarico dal tuo salone."}
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

      {/* SEARCH */}
      <div className="rounded-2xl border border-white/10 bg-scz-dark p-4 md:p-5 space-y-4">
        <div className="text-[10px] font-black uppercase tracking-wider text-white/50">
          Cerca prodotto
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 min-w-0 p-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder:text-white/40 focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30"
            placeholder="Nome prodotto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button
            onClick={search}
            disabled={!salonId}
            className="shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-black/30 border border-white/10 text-[#f3d8b6] font-semibold hover:bg-black/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Search size={18} />
            Cerca
          </button>
        </div>

        {isReady && !salonId && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3 items-start">
            <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-amber-200/90">
              {isReception
                ? "Nessun salone associato al tuo account. Contatta l'amministratore."
                : "Nessun salone selezionato. Usa lo switcher in alto."}
            </div>
          </div>
        )}
      </div>

      {/* RESULTS */}
      <div className="rounded-2xl border border-white/10 bg-scz-dark overflow-hidden">
        <div className="p-4 md:p-5 border-b border-white/10">
          <div className="text-[10px] font-black uppercase tracking-wider text-white/50">
            Risultati
          </div>
        </div>

        <div className="p-4 md:p-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-white/50">
              <span className="inline-block w-5 h-5 border-2 border-[#f3d8b6]/40 border-t-[#f3d8b6] rounded-full animate-spin" />
              <span>Ricerca in corso…</span>
            </div>
          )}

          {!loading && results.length > 0 && (
            <ul className="space-y-0 divide-y divide-white/10">
              {results.map((p) => {
                const isScaricando = scaricandoId === p.product_id;
                const canScarica = p.quantity > 0 && !isScaricando;
                return (
                  <li
                    key={p.product_id}
                    className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white truncate">{p.name}</p>
                      <p className="text-xs text-white/50 mt-0.5">
                        {p.quantity} disponibili
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canScarica}
                      onClick={() => scarica(p.product_id)}
                      className="shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[4.5rem] px-4 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white font-semibold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isScaricando ? (
                        <>
                          <span className="inline-block w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                          <span>…</span>
                        </>
                      ) : (
                        <>
                          <PackageMinus size={16} strokeWidth={2} />
                          <span>−1</span>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="rounded-2xl p-4 bg-black/20 border border-white/10 mb-3">
                <Search className="text-white/30" size={32} strokeWidth={1.5} />
              </div>
              <p className="text-white/60 font-medium">
                {salonId && query.trim()
                  ? "Nessun prodotto trovato per questa ricerca."
                  : salonId
                    ? "Inserisci un termine e clicca Cerca."
                    : "Seleziona un salone per cercare."}
              </p>
              <p className="text-white/40 text-sm mt-1">
                {salonId && !query.trim() && "La ricerca filtra per nome prodotto."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
