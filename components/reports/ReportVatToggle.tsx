"use client";

import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";

type Props = {
  mode: VatDisplayMode;
  onChange: (mode: VatDisplayMode) => void;
  className?: string;
};

export default function ReportVatToggle({ mode, onChange, className = "" }: Props) {
  return (
    <div
      className={`inline-flex rounded-xl border border-white/10 bg-black/30 p-1 ${className}`}
      role="group"
      aria-label="Visualizzazione importi"
    >
      <button
        type="button"
        onClick={() => onChange("gross")}
        className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
          mode === "gross"
            ? "bg-scz-gold/20 text-scz-gold shadow-sm"
            : "text-white/45 hover:text-white/70"
        }`}
      >
        Con IVA
      </button>
      <button
        type="button"
        onClick={() => onChange("net")}
        className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
          mode === "net"
            ? "bg-scz-gold/20 text-scz-gold shadow-sm"
            : "text-white/45 hover:text-white/70"
        }`}
      >
        Senza IVA
      </button>
    </div>
  );
}
