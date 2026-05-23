"use client";

import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import {
  BRIDGE_RUNBOOK_ENTRIES,
  runbookForCodes,
  type BridgeRunbookEntry,
} from "@/lib/bridge/bridgeRunbook";

/** Guide sempre visibili per reception / coordinator. */
const ESSENTIAL_RUNBOOK_CODES = [
  "bridge_offline",
  "fpmate_unreachable",
  "processing_stuck",
] as const;

type Props = {
  warningCodes: string[];
};

function RunbookCard({ entry }: { entry: BridgeRunbookEntry }) {
  return (
    <div className="rounded-2xl border border-[#f3d8b6]/15 bg-gradient-to-b from-[#f3d8b6]/[0.06] to-black/40 p-4">
      <h3 className="text-sm font-bold text-[#f3d8b6] mb-2">{entry.title}</h3>
      <ol className="space-y-2 text-sm text-[#c9b299] leading-relaxed">
        {entry.steps.map((step, i) => (
          <li key={step} className="flex gap-2">
            <span className="shrink-0 font-bold text-[#f3d8b6]/70">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function BridgeRunbookPanel({ warningCodes }: Props) {
  const [extraOpen, setExtraOpen] = useState(false);

  const essential = ESSENTIAL_RUNBOOK_CODES.map(
    (code) => BRIDGE_RUNBOOK_ENTRIES.find((e) => e.code === code)!,
  ).filter(Boolean);

  const contextual = runbookForCodes(warningCodes).filter(
    (e) => !ESSENTIAL_RUNBOOK_CODES.includes(e.code as (typeof ESSENTIAL_RUNBOOK_CODES)[number]),
  );

  return (
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5 md:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-[#f3d8b6]/20 bg-[#f3d8b6]/10 p-2">
          <BookOpen className="text-[#f3d8b6]" size={20} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-[#f3d8b6]">Cosa fare in caso di problema</h2>
          <p className="text-sm text-[#c9b299] mt-0.5">
            Passi semplici per reception e coordinator — senza termini tecnici.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {essential.map((entry) => (
          <RunbookCard key={entry.code} entry={entry} />
        ))}
      </div>

      {contextual.length > 0 ? (
        <div className="border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => setExtraOpen((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-bold text-[#c9b299] hover:text-[#f3d8b6]"
          >
            Altre situazioni segnalate ora ({contextual.length})
            {extraOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {extraOpen ? (
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {contextual.map((entry) => (
                <RunbookCard key={entry.code} entry={entry} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
