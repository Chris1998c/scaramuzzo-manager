"use client";

import Link from "next/link";

type Subtab = { key: string; label: string };

type Props = {
  subtabs: Subtab[];
  activeKey: string;
  baseParams: Record<string, string>;
  macroTab: string;
};

export default function ReportSubNav({ subtabs, activeKey, baseParams, macroTab }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {subtabs.map(({ key, label }) => {
        const params = new URLSearchParams({
          ...baseParams,
          tab: macroTab,
          subtab: key,
        });
        return (
          <Link
            key={key}
            href={`?${params.toString()}`}
            className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider border ${
              activeKey === key
                ? "border-scz-gold/40 bg-scz-gold/10 text-scz-gold"
                : "border-white/10 bg-black/20 text-white/50 hover:text-white/80"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
