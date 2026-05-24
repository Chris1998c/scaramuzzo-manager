"use client";

import type { StaffDrillDownData } from "@/lib/reports/buildStaffDrillDown";
import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import {
  computeStaffAlertBadges,
  STAFF_ALERT_BADGE_META,
} from "@/lib/reports/staffKpiAlerts";
import {
  formatReportMoney,
  formatReportPct,
} from "@/components/reports/reportFormatMoney";
import { formatRetailPenetrationPct } from "@/lib/reports/retailPenetration";

type Props = {
  row: StaffKpiRow;
  drillDown: StaffDrillDownData;
  teamAvgTicket: number;
  vatMode: "gross" | "net";
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-white/35">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ItemList({
  items,
  empty,
}: {
  items: Array<{ name: string; quantity: number; gross: number }>;
  empty: string;
}) {
  if (!items.length) {
    return <p className="text-xs text-white/40">{empty}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li key={it.name} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-white/75">{it.name}</span>
          <span className="shrink-0 text-white/45">
            {it.quantity} · {formatReportMoney(it.gross)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ReportStaffDrillDownPanel({
  row,
  drillDown,
  teamAvgTicket,
  vatMode,
}: Props) {
  const badges = computeStaffAlertBadges(row, teamAvgTicket, vatMode);
  const maxDaily = Math.max(...drillDown.dailyTrend.map((d) => d.gross), 1);

  return (
    <div className="space-y-4 border-t border-white/10 bg-black/25 px-4 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-white">Dettaglio operativo</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span
                key={b}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STAFF_ALERT_BADGE_META[b].className}`}
              >
                {STAFF_ALERT_BADGE_META[b].label}
              </span>
            ))}
          </div>
        </div>
        {drillDown.periodComparison ? (
          <div className="text-right">
            <p className="text-[10px] uppercase text-white/35">vs periodo precedente</p>
            <p
              className={`text-lg font-extrabold ${
                (drillDown.periodComparison.delta_pct ?? 0) >= 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }`}
            >
              {formatReportPct(drillDown.periodComparison.delta_pct)}
            </p>
            <p className="text-[11px] text-white/35">
              {formatReportMoney(drillDown.periodComparison.previous_incassato)} →{" "}
              {formatReportMoney(drillDown.periodComparison.current_incassato)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <Section title="Top servizi">
          <ItemList items={drillDown.topServices} empty="Nessun servizio nel periodo." />
        </Section>
        <Section title="Top prodotti">
          <ItemList items={drillDown.topProducts} empty="Nessun prodotto venduto." />
        </Section>
        <Section title="Retail dettagliato">
          <ul className="space-y-1 text-xs text-white/60">
            <li>Retail venduto: {formatReportMoney(drillDown.retailSold)}</li>
            <li>Penetrazione: {formatRetailPenetrationPct(row.retail_penetration_pct)}</li>
            <li>Prodotti qty: {drillDown.productsQty}</li>
            <li>Clienti senza retail: {row.customers_without_retail}</li>
          </ul>
        </Section>

        <Section title="Ultimi clienti serviti">
          {drillDown.recentCustomers.length === 0 ? (
            <p className="text-xs text-white/40">Nessun cliente collegato agli scontrini.</p>
          ) : (
            <ul className="space-y-1.5">
              {drillDown.recentCustomers.map((c) => (
                <li key={c.customer_id} className="flex justify-between gap-2 text-xs">
                  <span className="truncate text-white/75">
                    {c.customer_name ?? `Cliente #${c.customer_id}`}
                  </span>
                  <span className="text-white/45">
                    {c.last_day} · {formatReportMoney(c.gross)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Clienti senza prodotti">
          {drillDown.customersWithoutRetail.length === 0 ? (
            <p className="text-xs text-white/40">Tutti i clienti con almeno un prodotto.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {drillDown.customersWithoutRetail.map((c) => (
                <li
                  key={c.customer_id}
                  className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-white/55"
                >
                  {c.customer_name ?? `Cliente #${c.customer_id}`}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Scontrini & volumi">
          <ul className="space-y-1 text-xs text-white/60">
            <li>
              Scontati: {drillDown.discountedReceipts} / {drillDown.totalReceipts}
            </li>
            <li>Servizi qty: {drillDown.servicesQty}</li>
            <li>Senza cliente: {drillDown.receiptsWithoutCustomer}</li>
          </ul>
          {drillDown.receiptsWithoutCustomer > 0 ? (
            <p className="mt-2 text-[11px] text-amber-200/75">
              Alcuni scontrini senza cliente — clienti serviti possono essere sottostimati.
            </p>
          ) : null}
        </Section>
      </div>

      <Section title="Andamento giornaliero">
        {drillDown.dailyTrend.length === 0 ? (
          <p className="text-xs text-white/40">Nessuna vendita giornaliera nel periodo.</p>
        ) : (
          <ul className="space-y-2">
            {drillDown.dailyTrend.map((d) => (
              <li key={d.day} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-white/45">{d.day.slice(5)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-scz-gold/70"
                    style={{ width: `${Math.max(4, (d.gross / maxDaily) * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-white/55">
                  {formatReportMoney(d.gross)} · {d.receipts} scontr.
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="text-[11px] text-white/30">
        No-show collegati: disponibili in Cassa / Audit → Agenda (non inclusi qui per evitare query
        extra).
      </p>
    </div>
  );
}
