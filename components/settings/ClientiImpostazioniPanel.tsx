"use client";

import Link from "next/link";
import { ExternalLink, Info } from "lucide-react";

import type { CustomersDomainSnapshot } from "@/lib/customersDomainTypes";

function fmtCount(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("it-IT").format(n);
}

const ROWS: Array<{
  key: keyof CustomersDomainSnapshot["counts"];
  label: string;
  hint: string;
}> = [
  {
    key: "customers",
    label: "Anagrafica",
    hint: "Nome, cognome, telefono, email, indirizzo e note.",
  },
  {
    key: "customer_profile",
    label: "Profilo tecnico capelli",
    hint: "Texture, porosità, cuoio capelluto e altri dettagli (uno per cliente).",
  },
  {
    key: "customer_notes",
    label: "Note testuali",
    hint: "Annotazioni libere collegate al cliente.",
  },
  {
    key: "customer_tech_notes",
    label: "Note tecniche",
    hint: "Storico note operative per salone e collaboratore.",
  },
  {
    key: "technical_sheets",
    label: "Schede tecniche",
    hint: "Schede collegate a cliente, salone e collaboratore.",
  },
  {
    key: "customer_technical_cards",
    label: "Schede colore / trattamento",
    hint: "Parametri colore e trattamenti dedicati.",
  },
  {
    key: "customer_service_cards",
    label: "Schede servizio",
    hint: "Schede per tipo di servizio.",
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
          . Qui trovi solo i <strong className="text-[#e8dcc8]">conteggi</strong> di
          anagrafiche e schede visibili con i tuoi permessi.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 text-sm text-[#c9b299]">
        Qui trovi solo i conteggi. Per gestire i clienti apri il modulo Clienti.
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c9b299]/70">
            Conteggi anagrafiche e schede
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
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-black/30 text-[10px] font-black uppercase tracking-[0.18em] text-[#c9b299]/80">
            <tr>
              <th className="px-4 py-3">Ambito</th>
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
