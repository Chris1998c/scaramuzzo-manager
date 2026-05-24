"use client";

import type { StaffTeamSummary } from "@/lib/reports/buildStaffTeamSummary";
import { formatReportMoney } from "@/components/reports/reportFormatMoney";
import { formatRetailPenetrationPct } from "@/lib/reports/retailPenetration";

type Props = {
  summary: StaffTeamSummary;
};

function Highlight({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-wider text-white/35">{label}</p>
      <p className="mt-0.5 truncate text-sm font-extrabold text-white">{name}</p>
      <p className="text-xs text-scz-gold/90">{value}</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-wider text-white/35">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold text-white tabular-nums">{value}</p>
      {sub ? <p className="text-[11px] text-white/35">{sub}</p> : null}
    </div>
  );
}

export default function ReportTeamSummary({ summary }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-white/40">
          Team · sintesi periodo
        </p>
        <p className="mt-1 text-sm text-white/45">
          {summary.staff_count} collaboratori · KPI direzionali
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-8">
        <Stat label="Incasso team" value={formatReportMoney(summary.incasso)} />
        <Stat label="Valore listino" value={formatReportMoney(summary.listino)} />
        <Stat label="Sconti dati" value={formatReportMoney(summary.sconti)} />
        <Stat
          label="Retail team"
          value={formatRetailPenetrationPct(summary.retail_penetration_pct)}
        />
        <Stat label="Ticket medio" value={formatReportMoney(summary.avg_ticket)} />

        {summary.best_performer ? (
          <Highlight
            label="Miglior collaboratore"
            name={summary.best_performer.staff_name}
            value={formatReportMoney(summary.best_performer.value)}
          />
        ) : null}

        {summary.highest_discount ? (
          <Highlight
            label="Più sconti"
            name={summary.highest_discount.staff_name}
            value={`${summary.highest_discount.value.toFixed(1)}%`}
          />
        ) : null}

        {summary.lowest_retail ? (
          <Highlight
            label="Retail più basso"
            name={summary.lowest_retail.staff_name}
            value={formatRetailPenetrationPct(summary.lowest_retail.value)}
          />
        ) : null}
      </div>
    </div>
  );
}
