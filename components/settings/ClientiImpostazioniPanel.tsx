"use client";

import Link from "next/link";
import { ExternalLink, Info, Table2 } from "lucide-react";

import type { CustomersDomainSnapshot } from "@/lib/customersDomainTypes";

function fmtCount(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("it-IT").format(n);
}

const ROWS: Array<{
  key: keyof CustomersDomainSnapshot["counts"];
  label: string;
  table: string;
  hint: string;
}> = [
  {
    key: "customers",
    label: "Anagrafica",
    table: "public.customers",
    hint: "Nome, cognome, telefono (univoco), email, indirizzo, note.",
  },
  {
    key: "customer_profile",
    label: "Profilo tecnico capelli",
    table: "public.customer_profile",
    hint: "Texture, porosità, cuoio capelluto, ecc. (1:1 con cliente).",
  },
  {
    key: "customer_notes",
    label: "Note testuali",
    table: "public.customer_notes",
    hint: "Annotazioni libere collegate al cliente.",
  },
  {
    key: "customer_tech_notes",
    label: "Note tecniche",
    table: "public.customer_tech_notes",
    hint: "Storico note operative per salone/staff.",
  },
  {
    key: "technical_sheets",
    label: "Schede tecniche",
    table: "public.technical_sheets",
    hint: "Schede collegate a cliente, salone e staff.",
  },
  {
    key: "customer_technical_cards",
    label: "Schede colore / trattamento",
    table: "public.customer_technical_cards",
    hint: "Parametri colore e trattamenti (campi dedicati).",
  },
  {
    key: "customer_service_cards",
    label: "Schede servizio (JSON)",
    table: "public.customer_service_cards",
    hint: "Schede per tipo servizio con payload JSON.",
  },
];

type Props = {
  snapshot: CustomersDomainSnapshot;
};

export default function ClientiImpostazioniPanel({ snapshot }: Props) {
  const when = new Date(snapshot.fetchedAt).toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm text-[#c9b299] leading-relaxed">
        <span className="inline-flex items-center gap-2 font-bold text-sky-200/95">
          <Info size={16} className="shrink-0" />
          Scopo di questa sezione
        </span>
        <p className="mt-2">
          Qui non si gestiscono i clienti: l&apos;operatività resta in{" "}
          <Link
            href="/dashboard/clienti"
            className="font-semibold text-[#f3d8b6] underline underline-offset-2 hover:text-white inline-flex items-center gap-1"
          >
            Clienti <ExternalLink size={12} />
          </Link>
          . In Impostazioni mostriamo solo lo <strong className="text-[#e8dcc8]">stato sintetico</strong>{" "}
          del dominio dati (conteggi visibili secondo i permessi Supabase).
        </p>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 text-sm text-[#c9b299]">
        <strong className="text-amber-200/95">Configurazione dedicata:</strong> al momento non esiste una
        tabella o un namespace &quot;impostazioni clienti&quot; (privacy default, campi obbligatori, ecc.).
        Eventuali regole di prodotto andrebbero modellate in DB in un passo successivo; qui non si inventano
        colonne.
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c9b299]/70">
            Dominio dati — conteggi
          </p>
          <p className="text-sm text-[#c9b299]/80 mt-1">Aggiornato: {when}</p>
        </div>
        <Link
          href="/dashboard/clienti"
          className="inline-flex items-center gap-2 rounded-xl border border-[#f3d8b6]/30 bg-[#f3d8b6]/10 px-4 py-2 text-xs font-bold text-[#f3d8b6] hover:bg-[#f3d8b6]/15"
        >
          Apri modulo Clienti
          <ExternalLink size={14} />
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#5c3a21]/40">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-black/30 text-[10px] font-black uppercase tracking-[0.18em] text-[#c9b299]/80">
            <tr>
              <th className="px-4 py-3">Ambito</th>
              <th className="px-4 py-3">Tabella</th>
              <th className="px-4 py-3 text-right tabular-nums">Righe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#5c3a21]/30">
            {ROWS.map((r) => (
              <tr key={r.key} className="text-[#e8dcc8] hover:bg-white/[0.03]">
                <td className="px-4 py-3 align-top">
                  <span className="font-semibold text-[#f3d8b6]">{r.label}</span>
                  <p className="text-xs text-[#c9b299]/75 mt-1 leading-snug">{r.hint}</p>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#c9b299]">
                    <Table2 size={14} className="shrink-0 opacity-60" />
                    {r.table}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-[#f3d8b6] tabular-nums">
                  {fmtCount(snapshot.counts[r.key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
