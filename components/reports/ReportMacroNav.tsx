"use client";

import Link from "next/link";
import {
  REPORT_MACRO_LABELS,
  REPORT_MACRO_TAB_KEYS,
  type ReportMacroTabKey,
} from "@/lib/reportSalonResolve";

type Props = {
  active: ReportMacroTabKey;
  baseParams: Record<string, string>;
};

export default function ReportMacroNav({ active, baseParams }: Props) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl p-3 md:p-4">
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-2">
        {REPORT_MACRO_TAB_KEYS.map((key) => {
          const params = new URLSearchParams({ ...baseParams, tab: key });
          if (key === "vendite") params.set("subtab", "totali");
          if (key === "cassa_audit") params.set("subtab", "cassa");

          return (
            <Link
              key={key}
              href={`?${params.toString()}`}
              className={`px-4 py-3 rounded-xl font-bold border text-center text-sm md:text-base transition ${
                active === key
                  ? "bg-scz-medium border-scz-gold/30 text-scz-gold"
                  : "bg-black/20 border-white/10 text-white/70 hover:text-white"
              }`}
            >
              {REPORT_MACRO_LABELS[key]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
