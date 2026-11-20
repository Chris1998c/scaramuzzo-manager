"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveClientReportSalonId } from "@/lib/reports/reportSalonQuerySync";

type Props = { salonId: number; dateFrom: string; dateTo: string };

export default function ReportSalesPeriodSelector({ salonId, dateFrom, dateTo }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);
  const [isPending, startTransition] = useTransition();
  const effectiveSalonId = resolveClientReportSalonId(
    searchParams.get("salon_id"),
    salonId,
  );

  useEffect(() => {
    setFrom(dateFrom);
    setTo(dateTo);
  }, [dateFrom, dateTo]);

  function applyPeriod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || from > to) return;
    const params = new URLSearchParams(searchParams.toString());
    if (effectiveSalonId > 0) params.set("salon_id", String(effectiveSalonId));
    params.set("tab", "vendite");
    params.set("date_from", from);
    params.set("date_to", to);
    startTransition(() => {
      router.push(`/dashboard/report?${params.toString()}`);
    });
  }

  return (
    <form onSubmit={applyPeriod} className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="min-w-full text-sm font-bold text-[#f3d8b6] sm:min-w-0 sm:self-center sm:mr-2">Periodo vendite</div>
      <label className="flex flex-col gap-1 text-xs text-white/60">
        Dal
        <input type="date" required value={from} onChange={(event) => setFrom(event.target.value)}
          className="min-w-0 rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm text-white" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-white/60">
        Al
        <input type="date" required min={from} value={to} onChange={(event) => setTo(event.target.value)}
          className="min-w-0 rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm text-white" />
      </label>
      <button type="submit" disabled={isPending || !from || !to || from > to}
        className="rounded-xl border border-scz-gold/35 bg-scz-gold/15 px-4 py-2 text-sm font-bold text-scz-gold disabled:opacity-50">
        {isPending ? "Caricamento..." : "Mostra periodo"}
      </button>
    </form>
  );
}
