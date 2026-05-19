"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STATUSES = [
  "",
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;

const KINDS = ["", "sale_receipt", "void_receipt", "z_report"] as const;

type SalonOption = { id: number; name: string };

type Props = {
  salonId: number | null;
  status: string;
  kind: string;
  salonOptions: SalonOption[];
  showSalonFilter: boolean;
};

export default function FiscalJobsFilters({
  salonId,
  status,
  kind,
  salonOptions,
  showSalonFilter,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function apply(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => {
      router.push(`/dashboard/fiscale?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 md:p-5">
      <div className="flex flex-wrap items-end gap-4">
        {showSalonFilter ? (
          <label className="flex flex-col gap-1.5 min-w-[160px]">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              Salone
            </span>
            <select
              className="input text-sm"
              value={salonId != null ? String(salonId) : ""}
              disabled={isPending}
              onChange={(e) => {
                const v = e.target.value;
                apply({ salon_id: v === "" ? null : v });
              }}
            >
              <option value="">Tutti</option>
              {salonOptions.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} (#{s.id})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5 min-w-[140px]">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            Stato
          </span>
          <select
            className="input text-sm"
            value={status}
            disabled={isPending}
            onChange={(e) => apply({ status: e.target.value || null })}
          >
            {STATUSES.map((s) => (
              <option key={s || "all"} value={s}>
                {s === "" ? "Tutti" : s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 min-w-[160px]">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            Tipo job
          </span>
          <select
            className="input text-sm"
            value={kind}
            disabled={isPending}
            onChange={(e) => apply({ kind: e.target.value || null })}
          >
            {KINDS.map((k) => (
              <option key={k || "all"} value={k}>
                {k === "" ? "Tutti" : k}
              </option>
            ))}
          </select>
        </label>

        {isPending ? (
          <span className="text-xs text-[#c9b299]/70 pb-2">Aggiornamento…</span>
        ) : null}
      </div>
    </div>
  );
}
