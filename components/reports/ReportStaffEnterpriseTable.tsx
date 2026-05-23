"use client";

import { Fragment, useMemo, useState } from "react";
import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";
import ReportVatToggle from "@/components/reports/ReportVatToggle";
import { formatReportMoney } from "@/components/reports/reportFormatMoney";
import { formatRetailPenetrationPct } from "@/lib/reports/retailPenetration";
import {
  computeStaffAlertBadges,
  computeTeamAvgTicket,
  STAFF_ALERT_BADGE_META,
} from "@/lib/reports/staffKpiAlerts";

type Props = {
  rows: StaffKpiRow[];
};

function rankClass(idx: number): string {
  if (idx === 0) return "text-scz-gold";
  if (idx === 1) return "text-white/85";
  if (idx === 2) return "text-amber-200/80";
  return "text-white/45";
}

export default function ReportStaffEnterpriseTable({ rows }: Props) {
  const [vatMode, setVatMode] = useState<VatDisplayMode>("gross");
  const [expanded, setExpanded] = useState<number | null>(null);

  const teamAvgTicket = useMemo(() => computeTeamAvgTicket(rows, vatMode), [rows, vatMode]);

  const teamPenetration = useMemo(() => {
    let served = 0;
    let withRetail = 0;
    for (const r of rows) {
      served += r.customers_served;
      withRetail += r.customers_with_retail;
    }
    const pct = served > 0 ? Math.round((withRetail / served) * 1000) / 10 : null;
    return { served, withRetail, pct };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            Team · classifica periodo
          </p>
          <p className="mt-1 text-sm text-white/50">
            Ranking per incassato · badge su sconti, retail e scontrino
          </p>
        </div>
        <ReportVatToggle mode={vatMode} onChange={setVatMode} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[10px] font-black uppercase text-white/40">Retail team</p>
          <p className="mt-1 text-xl font-extrabold text-scz-gold">
            {formatRetailPenetrationPct(teamPenetration.pct)}
          </p>
          <p className="text-xs text-white/35">
            {teamPenetration.withRetail} / {teamPenetration.served} clienti serviti
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[10px] font-black uppercase text-white/40">Scontrino medio team</p>
          <p className="mt-1 text-xl font-extrabold text-white">
            {formatReportMoney(teamAvgTicket)}
          </p>
          <p className="text-xs text-white/35">Soglia scontrino basso: 75% di questa media</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 col-span-2 lg:col-span-1">
          <p className="text-[10px] font-black uppercase text-white/40">Collaboratori</p>
          <p className="mt-1 text-xl font-extrabold text-white">{rows.length}</p>
          <p className="text-xs text-white/35">Ordinati per incassato</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full text-sm">
            <thead>
              <tr className="bg-black/30 text-[10px] font-black uppercase tracking-wider text-white/50">
                <th className="px-3 py-3 text-left text-white/90"># · Collaboratore</th>
                <th className="px-3 py-3 text-right text-scz-gold/90">Incassato</th>
                <th className="px-3 py-3 text-right">Valore a listino</th>
                <th className="px-3 py-3 text-right">Sconti dati</th>
                <th className="px-3 py-3 text-right">Sconto %</th>
                <th className="px-3 py-3 text-right">Clienti serviti</th>
                <th className="px-3 py-3 text-right">Retail %</th>
                <th className="px-3 py-3 text-right">Scontrino medio</th>
                <th className="px-3 py-3 text-right">Retail venduto</th>
                <th className="px-3 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-white/40">
                    Nessun dato nel periodo selezionato.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  const m = pickStaffMoney(r, vatMode);
                  const badges = computeStaffAlertBadges(r, teamAvgTicket, vatMode);
                  const isOpen = expanded === r.staff_id;

                  return (
                    <Fragment key={r.staff_id}>
                      <tr
                        className={`${idx % 2 === 0 ? "bg-black/10" : ""} hover:bg-black/15 cursor-pointer`}
                        onClick={() => setExpanded(isOpen ? null : r.staff_id)}
                      >
                        <td className="px-3 py-3 font-extrabold text-white">
                          <span className={`mr-2 ${rankClass(idx)}`}>#{idx + 1}</span>
                          {r.staff_name}
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
                        </td>
                        <td className="px-3 py-3 text-right font-extrabold text-scz-gold">
                          {formatReportMoney(m.real)}
                        </td>
                        <td className="px-3 py-3 text-right text-white/80">
                          {formatReportMoney(m.full)}
                        </td>
                        <td className="px-3 py-3 text-right text-amber-200/90">
                          {formatReportMoney(m.discount)}
                        </td>
                        <td className="px-3 py-3 text-right">{m.discount_pct.toFixed(1)}%</td>
                        <td className="px-3 py-3 text-right">{r.customers_served}</td>
                        <td className="px-3 py-3 text-right">
                          {formatRetailPenetrationPct(r.retail_penetration_pct)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatReportMoney(m.avg_ticket_real)}
                        </td>
                        <td className="px-3 py-3 text-right">{formatReportMoney(m.retail)}</td>
                        <td className="px-3 py-3 text-white/30 text-xs">{isOpen ? "▲" : "▼"}</td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-black/25">
                          <td colSpan={10} className="px-4 py-4">
                            <div className="grid gap-3 text-xs text-white/55 sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <p className="font-black uppercase text-white/35">Servizi fatti</p>
                                <p className="mt-1 text-base font-bold text-white">{r.services_qty}</p>
                              </div>
                              <div>
                                <p className="font-black uppercase text-white/35">Prodotti venduti</p>
                                <p className="mt-1 text-base font-bold text-white">{r.products_qty}</p>
                              </div>
                              <div>
                                <p className="font-black uppercase text-white/35">Scontrini scontati</p>
                                <p className="mt-1 text-base font-bold text-white">
                                  {r.discounted_receipts_count} / {r.receipts_count}
                                </p>
                              </div>
                              <div>
                                <p className="font-black uppercase text-white/35">Clienti senza prodotti</p>
                                <p className="mt-1 text-base font-bold text-white">
                                  {r.customers_without_retail}
                                </p>
                              </div>
                              <div>
                                <p className="font-black uppercase text-white/35">Scontrino a listino</p>
                                <p className="mt-1 text-base font-bold text-white">
                                  {formatReportMoney(m.avg_ticket_full)}
                                </p>
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                {r.receipts_without_customer > 0 ? (
                                  <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-amber-100/80">
                                    {r.receipts_without_customer} scontrini senza cliente collegato —
                                    i clienti serviti possono essere sottostimati.
                                  </p>
                                ) : r.customers_served === 0 && r.receipts_count > 0 ? (
                                  <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                                    Nessun customer_id sugli scontrini — clienti serviti non calcolabili.
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
