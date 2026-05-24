"use client";

import { Fragment, useMemo, useState } from "react";
import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";
import type { StaffDrillDownByStaff } from "@/lib/reports/buildStaffDrillDownPayloadServer";
import { adjustStaffDrillDownVat } from "@/lib/reports/adjustStaffDrillDownVat";
import { buildStaffTeamSummary } from "@/lib/reports/buildStaffTeamSummary";
import ReportVatToggle from "@/components/reports/ReportVatToggle";
import ReportTeamSummary from "@/components/reports/ReportTeamSummary";
import ReportStaffDrillDownPanel from "@/components/reports/ReportStaffDrillDownPanel";
import { formatReportMoney } from "@/components/reports/reportFormatMoney";
import { formatRetailPenetrationPct } from "@/lib/reports/retailPenetration";
import { computeTeamAvgTicket } from "@/lib/reports/staffKpiAlerts";

type Props = {
  rows: StaffKpiRow[];
  staffDrillDownByStaff?: StaffDrillDownByStaff;
  previousStaffRows?: StaffKpiRow[];
};

function rankClass(idx: number): string {
  if (idx === 0) return "text-scz-gold";
  if (idx === 1) return "text-white/85";
  if (idx === 2) return "text-amber-200/80";
  return "text-white/45";
}

export default function ReportStaffEnterpriseTable({
  rows,
  staffDrillDownByStaff = {},
  previousStaffRows = [],
}: Props) {
  const [vatMode, setVatMode] = useState<VatDisplayMode>("gross");
  const [expanded, setExpanded] = useState<number | null>(null);

  const teamAvgTicket = useMemo(() => computeTeamAvgTicket(rows, vatMode), [rows, vatMode]);
  const summary = useMemo(() => buildStaffTeamSummary(rows, vatMode), [rows, vatMode]);

  const previousByStaff = useMemo(() => {
    const map = new Map<number, StaffKpiRow>();
    for (const r of previousStaffRows) map.set(r.staff_id, r);
    return map;
  }, [previousStaffRows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <ReportTeamSummary summary={summary} />
        </div>
        <div className="shrink-0">
          <ReportVatToggle mode={vatMode} onChange={setVatMode} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-sm">
            <thead>
              <tr className="bg-black/30 text-[10px] font-black uppercase tracking-wider text-white/50">
                <th className="px-3 py-3 text-left text-white/90">Collaboratore</th>
                <th className="px-3 py-3 text-right text-scz-gold/90">Incassato</th>
                <th className="px-3 py-3 text-right">Valore listino</th>
                <th className="px-3 py-3 text-right">Sconti</th>
                <th className="px-3 py-3 text-right">% sconto</th>
                <th className="px-3 py-3 text-right">Clienti</th>
                <th className="px-3 py-3 text-right">Retail %</th>
                <th className="px-3 py-3 text-right">Ticket medio</th>
                <th className="px-3 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-white/40">
                    Nessun dato nel periodo selezionato.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  const m = pickStaffMoney(r, vatMode);
                  const isOpen = expanded === r.staff_id;
                  const baseDrill = staffDrillDownByStaff[String(r.staff_id)];
                  const drillDown =
                    isOpen && baseDrill
                      ? adjustStaffDrillDownVat(
                          baseDrill,
                          r,
                          previousByStaff.get(r.staff_id),
                          vatMode,
                        )
                      : null;

                  return (
                    <Fragment key={r.staff_id}>
                      <tr
                        className={`${idx % 2 === 0 ? "bg-black/10" : ""} cursor-pointer hover:bg-black/20 transition-colors`}
                        onClick={() => setExpanded(isOpen ? null : r.staff_id)}
                      >
                        <td className="px-3 py-3 font-extrabold text-white">
                          <span className={`mr-2 tabular-nums ${rankClass(idx)}`}>#{idx + 1}</span>
                          {r.staff_name}
                        </td>
                        <td className="px-3 py-3 text-right font-extrabold text-scz-gold tabular-nums">
                          {formatReportMoney(m.real)}
                        </td>
                        <td className="px-3 py-3 text-right text-white/80 tabular-nums">
                          {formatReportMoney(m.full)}
                        </td>
                        <td className="px-3 py-3 text-right text-amber-200/90 tabular-nums">
                          {formatReportMoney(m.discount)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {m.discount_pct.toFixed(1)}%
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.customers_served}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatRetailPenetrationPct(r.retail_penetration_pct)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatReportMoney(m.avg_ticket_real)}
                        </td>
                        <td className="px-3 py-3 text-center text-white/30 text-xs">
                          {isOpen ? "▲" : "▼"}
                        </td>
                      </tr>
                      {isOpen && drillDown ? (
                        <tr className="bg-black/25">
                          <td colSpan={9} className="p-0">
                            <ReportStaffDrillDownPanel
                              row={r}
                              drillDown={drillDown}
                              teamAvgTicket={teamAvgTicket}
                              vatMode={vatMode}
                            />
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

      <p className="text-xs text-white/35">
        Clicca un collaboratore per il dettaglio live — nessun reload, nessun export.
      </p>
    </div>
  );
}
