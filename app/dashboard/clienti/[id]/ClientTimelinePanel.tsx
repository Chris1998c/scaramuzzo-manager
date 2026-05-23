"use client";

import { useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId || !isReady) return;
    if (activeSalonId == null) {
      setEntries([]);
      setTotalSpent(0);
      setLoading(false);
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
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([]);
          setTotalSpent(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, activeSalonId, isReady]);

  return (
    <div className="rounded-2xl border border-white/10 bg-scz-dark p-6 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            Storico salone
          </p>
          <h3 className="mt-1 text-lg font-extrabold text-white">Timeline cliente</h3>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-white/35">Totale speso</p>
          <p className="text-lg font-extrabold text-scz-gold">{formatReportMoney(totalSpent)}</p>
        </div>
      </div>

      {loading ? (
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
                <p className={`text-sm font-bold ${KIND_COLOR[e.kind]}`}>{KIND_LABEL[e.kind]}</p>
                {e.detail ? <p className="text-xs text-white/45 truncate">{e.detail}</p> : null}
                {e.amount != null && e.amount > 0 ? (
                  <p className="text-xs text-white/35">{formatReportMoney(e.amount)}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
