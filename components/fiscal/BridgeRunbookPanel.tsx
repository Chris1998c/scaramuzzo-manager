"use client";

import {
  BRIDGE_RUNBOOK_ENTRIES,
  runbookForCodes,
  type BridgeRunbookEntry,
} from "@/lib/bridge/bridgeRunbook";

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
    <div className="rounded-xl border border-[#f3d8b6]/12 bg-black/30 p-3">
      <h3 className="text-sm font-bold text-[#f3d8b6] mb-2">{entry.title}</h3>
      <ol className="space-y-1.5 text-xs text-[#c9b299] leading-relaxed">
        {entry.steps.map((step, i) => (
          <li key={step} className="flex gap-2">
            <span className="shrink-0 font-bold text-[#f3d8b6]/60">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Contenuto runbook (wrapper accordion nel parent). */
export default function BridgeRunbookPanel({ warningCodes }: Props) {
  const essential = ESSENTIAL_RUNBOOK_CODES.map(
    (code) => BRIDGE_RUNBOOK_ENTRIES.find((e) => e.code === code)!,
  ).filter(Boolean);

  const contextual = runbookForCodes(warningCodes).filter(
    (e) => !ESSENTIAL_RUNBOOK_CODES.includes(e.code as (typeof ESSENTIAL_RUNBOOK_CODES)[number]),
  );

  return (
    <div className="space-y-4 pt-1">
      <div className="grid gap-3 md:grid-cols-3">
        {essential.map((entry) => (
          <RunbookCard key={entry.code} entry={entry} />
        ))}
      </div>
      {contextual.length > 0 ? (
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-white/40 mb-2">
            Situazioni attive ora
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {contextual.map((entry) => (
              <RunbookCard key={entry.code} entry={entry} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
