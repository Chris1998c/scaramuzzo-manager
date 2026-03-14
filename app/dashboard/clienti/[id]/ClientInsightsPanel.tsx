"use client";

import { useEffect, useState } from "react";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { Lightbulb, AlertTriangle, Package, Sparkles, Scissors, ListTodo } from "lucide-react";
import type { ClientInsightsResult } from "@/lib/client-intelligence/buildClientInsights";

type Props = { customerId: string };

export default function ClientInsightsPanel({ customerId }: Props) {
  const { activeSalonId, isReady } = useActiveSalon();
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<ClientInsightsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId || !isReady) return;
    if (activeSalonId == null || !Number.isFinite(Number(activeSalonId))) {
      setInsights(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(
      `/api/client-intelligence?customerId=${encodeURIComponent(customerId)}&salonId=${encodeURIComponent(String(activeSalonId))}`
    )
      .then((res) => {
        if (!res.ok) throw new Error("Errore caricamento insights");
        return res.json();
      })
      .then((json: { insights?: ClientInsightsResult }) => {
        if (cancelled) return;
        setInsights(json.insights ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Errore");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, activeSalonId, isReady]);

  const hasSummary = Array.isArray(insights?.summary) && insights.summary.length > 0;
  const hasWarnings = Array.isArray(insights?.warnings) && insights.warnings.length > 0;
  const hasServices = Array.isArray(insights?.recommendedServices) && insights.recommendedServices.length > 0;
  const hasProducts = Array.isArray(insights?.recommendedProducts) && insights.recommendedProducts.length > 0;
  const hasActions = Array.isArray(insights?.suggestedActions) && insights.suggestedActions.length > 0;
  const hasAny = hasSummary || hasWarnings || hasServices || hasProducts || hasActions;

  if (!isReady || activeSalonId == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-scz-dark p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
          <Lightbulb className="text-[#f3d8b6]" size={20} />
          <h2 className="text-lg font-bold text-[#f3d8b6]">Insights Cliente</h2>
        </div>
        <p className="text-sm text-white/50">Seleziona un salone per vedere suggerimenti e insights.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-scz-dark p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)]">
        <div className="border-b border-white/10 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="text-[#f3d8b6]" size={20} />
            <h2 className="text-lg font-bold text-[#f3d8b6]">Insights Cliente</h2>
          </div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/45 mt-1">Suggerimenti basati sui dati del salone attivo</p>
        </div>
        <p className="text-sm text-white/50">Caricamento...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-white/10 bg-scz-dark p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
          <Lightbulb className="text-[#f3d8b6]" size={20} />
          <h2 className="text-lg font-bold text-[#f3d8b6]">Insights Cliente</h2>
        </div>
        <p className="text-sm text-red-300/90">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)] overflow-hidden">
      <div className="border-b border-white/10 bg-black/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="text-[#f3d8b6]" size={20} />
          <h2 className="text-lg font-bold text-[#f3d8b6]">Insights Cliente</h2>
        </div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/45 mt-1">Suggerimenti basati sui dati del salone attivo</p>
      </div>

      <div className="p-6 space-y-5">
        {!hasAny && (
          <p className="text-sm text-white/50 italic">
            Dati ancora insufficienti per generare suggerimenti.
          </p>
        )}

        {hasSummary && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-[#f3d8b6]/80" />
              <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50">Profilo sintetico</h3>
            </div>
            <ul className="space-y-1.5">
              {insights!.summary.map((s, i) => (
                <li key={i} className="text-sm text-white/90 pl-5 border-l-2 border-[#f3d8b6]/30">
                  {s}
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasWarnings && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-amber-400/90" />
              <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50">Avvertenze</h3>
            </div>
            <ul className="space-y-1.5">
              {insights!.warnings.map((w, i) => (
                <li key={i} className="text-sm text-amber-200/90 pl-5 border-l-2 border-amber-400/40">
                  {w}
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasServices && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Scissors size={16} className="text-[#f3d8b6]/80" />
              <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50">Servizi consigliati</h3>
            </div>
            <ul className="space-y-1.5">
              {insights!.recommendedServices.map((s, i) => (
                <li key={i} className="text-sm text-white/85">
                  {s}
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasProducts && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Package size={16} className="text-[#f3d8b6]/80" />
              <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50">Prodotti consigliati</h3>
            </div>
            <ul className="space-y-1.5">
              {insights!.recommendedProducts.map((p, i) => (
                <li key={i} className="text-sm text-white/85">
                  {p}
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasActions && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <ListTodo size={16} className="text-[#f3d8b6]/80" />
              <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50">Azioni suggerite</h3>
            </div>
            <ul className="space-y-1.5">
              {insights!.suggestedActions.map((a, i) => (
                <li key={i} className="text-sm text-[#f3d8b6]/95 font-medium">
                  {a}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
