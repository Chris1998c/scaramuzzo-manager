"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import type { TimelineEntry } from "@/lib/reports/buildCustomerTimeline";
import { formatReportMoney } from "@/components/reports/reportFormatMoney";

type Props = { customerId: string };

const KIND_LABEL: Record<TimelineEntry["kind"], string> = {
  appointment: "Appuntamento",
  service: "Servizio",
  product: "Prodotto",
  noshow: "No-show",
  spesa: "Spesa",
};

const KIND_COLOR: Record<TimelineEntry["kind"], string> = {
  appointment: "text-scz-gold/90",
  service: "text-white/70",
  product: "text-emerald-300/80",
  noshow: "text-red-300/90",
  spesa: "text-scz-gold",
};

export default function ClientTimelinePanel({ customerId }: Props) {
  const { activeSalonId, isReady } = useActiveSalon();
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(false);
  /** Chiusa di default: fetch solo alla prima apertura (non in parallelo all’apertura scheda). */
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    setEntries([]);
    setTotalSpent(0);
    setFetched(false);
  }, [customerId, activeSalonId]);

  useEffect(() => {
    if (!open || fetched) return;
    if (!customerId || !isReady) return;
    if (activeSalonId == null) {
      setEntries([]);
      setTotalSpent(0);
      setFetched(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/client-timeline?customerId=${encodeURIComponent(customerId)}&salonId=${encodeURIComponent(String(activeSalonId))}`,
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Timeline error"))))
      .then((json: { entries?: TimelineEntry[]; total_spent?: number }) => {
        if (cancelled) return;
        setEntries(json.entries ?? []);
        setTotalSpent(Number(json.total_spent ?? 0));
        setFetched(true);
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([]);
          setTotalSpent(0);
          setFetched(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, fetched, customerId, activeSalonId, isReady]);

  return (
    <div className="rounded-2xl border border-white/10 bg-scz-dark p-6 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-end justify-between gap-3 text-left rounded-xl
 hover:bg-white/[0.03] transition -m-1 p-1"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/40">Storico salone</p>
          <h3 className="mt-1 text-lg font-extrabold text-white">Timeline cliente</h3>
          {!open ? (
            <p className="mt-1 text-xs text-white/40">Apri per caricare lo storico</p>
          ) : null}
        </div>
        <div className="flex items-end gap-3 shrink-0">
          <div className="text-right">
            <p className="text-[10px] uppercase text-white/35">Totale speso</p>
            <p className="text-lg font-extrabold text-scz-gold">
              {fetched ? formatReportMoney(totalSpent) : "—"}
            </p>
          </div>
          {open ? (
            <ChevronUp size={18} className="text-white/50 mb-1" aria-hidden />
          ) : (
            <ChevronDown size={18} className="text-white/50 mb-1" aria-hidden />
          )}
        </div>
      </button>

      {open &&
        (loading ? (
          <p className="text-sm text-white/40">Caricamento storico…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-white/40">Nessun evento per questo salone.</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <div className="min-w-[72px] text-xs font-bold text-white/45">{e.date}</div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${KIND_COLOR[e.kind]}`}>
                    {KIND_LABEL[e.kind]}
                  </p>
                  {e.detail ? (
                    <p className="text-xs text-white/45 truncate">{e.detail}</p>
                  ) : null}
                  {e.amount != null && e.amount > 0 ? (
                    <p className="text-xs text-white/35">{formatReportMoney(e.amount)}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
