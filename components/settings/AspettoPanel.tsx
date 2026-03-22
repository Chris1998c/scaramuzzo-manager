"use client";

import { Info, LayoutPanelLeft, Palette } from "lucide-react";

import { useUI } from "@/lib/ui-store";

/**
 * Audit progetto (v1):
 * - Nessuna tabella Supabase per tema / branding / preferenze UI per utente o salone.
 * - Look & feel definito da `app/globals.css` (:root) e Tailwind (`tailwind.config.js`, token `scz.*`).
 * - Persistenza client reale: store Zustand `scz-ui` (localStorage) — oggi usato per sidebar + legacy activeSalonId;
 *   il salone attivo operativo è gestito da `ActiveSalonProvider` (`sm_activeSalonId`).
 */

export default function AspettoPanel() {
  const { sidebarOpen, setSidebarOpen } = useUI();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-[#c9b299] leading-relaxed">
        <span className="inline-flex items-center gap-2 font-bold text-rose-200/95">
          <Info size={16} className="shrink-0" />
          Stato configurazione
        </span>
        <p className="mt-2">
          Nel database <strong className="text-[#e8dcc8]">non è ancora modellata</strong> alcuna
          preferenza di tema, colore o branding per utente/salone. Questa sezione non inventa
          colonne: quando esisterà uno storage reale, qui si potranno collegare i controlli.
        </p>
      </div>

      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-violet-200/95">
          <Palette size={18} />
          <span className="text-sm font-bold">Palette applicativa (codice)</span>
        </div>
        <p className="mt-2 text-sm text-[#c9b299] leading-relaxed">
          Il tema è <strong className="text-[#e8dcc8]">unico e scuro</strong>, definito staticamente in{" "}
          <code className="text-[#f3d8b6]/90">app/globals.css</code> (variabili CSS{" "}
          <code className="text-white/55">--bg</code>, <code className="text-white/55">--card</code>,{" "}
          <code className="text-white/55">--text</code>, <code className="text-white/55">--accent</code>
          ) e integrato con Tailwind (token <code className="text-white/55">scz.dark</code>,{" "}
          <code className="text-white/55">scz.gold</code>, ecc.). Non è selezionabile dall&apos;utente
          finché non esiste persistenza dedicata.
        </p>
      </div>

      <div className="rounded-2xl border border-[#5c3a21]/40 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-[#f3d8b6]">
          <LayoutPanelLeft size={18} />
          <span className="text-sm font-bold">Barra laterale (desktop)</span>
        </div>
        <p className="mt-2 text-xs text-[#c9b299]/90 leading-relaxed">
          Unica preferenza UI persistita oggi nel client: stato apertura sidebar in{" "}
          <code className="text-white/50">localStorage</code> (store Zustand{" "}
          <code className="text-white/50">scz-ui</code>). Vale per questa postazione browser.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-[#e8dcc8]">Sidebar aperta su desktop</span>
          <button
            type="button"
            role="switch"
            aria-checked={sidebarOpen}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={[
              "relative h-8 w-14 rounded-full transition-colors border",
              sidebarOpen
                ? "bg-emerald-500/25 border-emerald-500/40"
                : "bg-white/5 border-white/15",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-1 h-6 w-6 rounded-full bg-[#f3d8b6] shadow transition-transform",
                sidebarOpen ? "left-7" : "left-1",
              ].join(" ")}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
