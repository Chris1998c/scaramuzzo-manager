"use client";

import { BookOpen } from "lucide-react";
import { runbookForCodes, type BridgeRunbookEntry } from "@/lib/bridge/bridgeRunbook";

type Props = {
  warningCodes: string[];
};

export default function BridgeRunbookPanel({ warningCodes }: Props) {
  const entries = runbookForCodes([...new Set(warningCodes)]);
  if (!entries.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
      <div className="flex items-center gap-2 text-[#f3d8b6] text-sm font-bold">
        <BookOpen size={16} />
        Runbook operativo
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {entries.map((entry: BridgeRunbookEntry) => (
          <div
            key={entry.code}
            className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-[#c9b299]"
          >
            <div className="font-bold text-[#f3d8b6] mb-2">{entry.title}</div>
            <ol className="list-decimal list-inside space-y-1">
              {entry.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
