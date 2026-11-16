"use client";

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
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c9b299]/70">
          Conteggi anagrafiche e schede
        </p>
        <p className="text-sm text-[#c9b299]/80 mt-1">Aggiornato: {when}</p>
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
