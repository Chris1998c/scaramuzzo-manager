"use client";

import Link from "next/link";
import type { DirectionReport } from "@/lib/reports/getDirectionReport";
import ReportVatToggle from "@/components/reports/ReportVatToggle";
import { useReportVatModeUrl } from "@/components/reports/useReportVatModeUrl";
import ReportCrmCustomerActions from "@/components/reports/ReportCrmCustomerActions";
import {
  formatReportInt,
  formatReportMoney,
  formatReportPct,
} from "@/components/reports/reportFormatMoney";

type Props = {
  data: DirectionReport;
  salonLabel?: string | null;
};

function GrowthBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-white/40">—</span>;
  const positive = value >= 0;
  return (
    <span className={`text-xs font-black ${positive ? "text-emerald-400" : "text-red-400"}`}>
      {formatReportPct(value)}
    </span>
  );
}

function HeroKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 md:p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-2 text-2xl md:text-3xl font-extrabold text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-white/40">{sub}</p> : null}
    </div>
  );
}

export default function ReportDirectionView({ data, salonLabel }: Props) {
  const [vatMode, setVatMode] = useReportVatModeUrl();

  const money = vatMode === "gross" ? data.today.money.gross : data.today.money.net;
  const monthMoney = vatMode === "gross" ? data.month.money.gross : data.month.money.net;
  const ticket =
    vatMode === "gross" ? data.today.avg_ticket_gross : data.today.avg_ticket_net;
  const monthPct =
    vatMode === "gross"
      ? data.monthComparison.gross_real_pct
      : data.monthComparison.net_real_pct;
  const vsYesterdayPct =
    vatMode === "gross" ? data.vsYesterday.pct_gross : data.vsYesterday.pct_net;
  const vsLastWeekPct =
    vatMode === "gross"
      ? data.vsLastWeekSameDay.pct_gross
      : data.vsLastWeekSameDay.pct_net;
  const yesterdayAmt =
    vatMode === "gross" ? data.vsYesterday.amount_gross : data.vsYesterday.amount_net;
  const lastWeekAmt =
    vatMode === "gross"
      ? data.vsLastWeekSameDay.amount_gross
      : data.vsLastWeekSameDay.amount_net;

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-scz-gold/80">
            Cockpit di oggi e mese corrente
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            Riepilogo
          </h2>
          <p className="mt-1 text-sm text-white/45">
            {salonLabel ? `${salonLabel} · ` : ""}
            Oggi e mese in corso — non usa il periodo filtrato in alto
          </p>
          <p className="mt-2 text-xs text-white/35">
            Per date personalizzate vai in <span className="text-scz-gold/80 font-bold">Vendite</span>.
          </p>
        </div>
        <ReportVatToggle mode={vatMode} onChange={setVatMode} />
      </div>

      <div className="rounded-2xl border border-scz-gold/35 bg-gradient-to-br from-scz-gold/10 via-black/20 to-transparent p-6 md:p-8">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Incasso reale · oggi
        </p>
        <p className="mt-2 text-4xl md:text-5xl font-extrabold text-scz-gold">
          {formatReportMoney(money.real)}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/50">
          <span>
            <GrowthBadge value={vsYesterdayPct} /> vs ieri ({formatReportMoney(yesterdayAmt)})
          </span>
          <span>
            <GrowthBadge value={vsLastWeekPct} /> vs stesso giorno sett. scorsa (
            {formatReportMoney(lastWeekAmt)})
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <HeroKpi label="Scontrini" value={formatReportInt(data.today.receipts_count)} />
        <HeroKpi label="Scontrino medio" value={formatReportMoney(ticket)} />
        <HeroKpi label="Sconti dati" value={formatReportMoney(money.discount)} />
        <HeroKpi
          label="Mese corrente"
          value={formatReportMoney(monthMoney.real)}
          sub={monthPct != null ? `${formatReportPct(monthPct)} vs mese prec.` : undefined}
        />
        <HeroKpi
          label="Valore a listino"
          value={formatReportMoney(money.full)}
          sub="Listino senza sconti oggi"
        />
      </div>

      {data.alerts.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/80">
            Da controllare oggi
          </p>
          <ul className="mt-4 space-y-3">
            {data.alerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <div>
                  <p className="font-bold text-white">
                    {a.title} <span className="text-scz-gold">({a.count})</span>
                  </p>
                  <p className="text-xs text-white/45 mt-0.5">{a.detail}</p>
                </div>
                <Link
                  href={a.href}
                  className="shrink-0 rounded-lg border border-scz-gold/30 bg-scz-gold/10 px-3 py-1.5 text-xs font-bold text-scz-gold hover:bg-scz-gold/20"
                >
                  Apri
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-scz-dark overflow-hidden">
        <div className="border-b border-white/10 bg-black/25 px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-scz-gold/80">
            Da fare ora
          </p>
          <p className="mt-1 text-sm text-white/50">Massimo 5 clienti prioritari</p>
        </div>
        <ul className="divide-y divide-white/5">
          {data.crmActions.length === 0 ? (
            <li className="px-6 py-8 text-center text-sm text-white/35">
              Nessuna azione urgente al momento
            </li>
          ) : (
            data.crmActions.map((c) => (
              <li
                key={`${c.category}-${c.customer_id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">{c.customer_name}</p>
                  <p className="text-xs text-scz-gold/80 font-bold flex flex-wrap items-center gap-1.5">
                    <span>{c.reason}</span>
                    {(c.extra_reasons_count ?? 0) > 0 ? (
                      <span className="rounded-full border border-white/15 bg-black/30 px-1.5 py-0.5 text-[10px] font-bold text-white/55">
                        +{c.extra_reasons_count} motivi
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-white/40 truncate">{c.detail}</p>
                </div>
                <ReportCrmCustomerActions customerId={c.customer_id} phone={c.phone} />
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
