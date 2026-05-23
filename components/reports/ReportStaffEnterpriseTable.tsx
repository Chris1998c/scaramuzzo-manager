"use client";

import { Fragment, useState } from "react";
import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";
import ReportVatToggle from "@/components/reports/ReportVatToggle";
import { formatReportMoney } from "@/components/reports/reportFormatMoney";

type Props = {
  rows: StaffKpiRow[];
};

const HIGH_DISCOUNT = 15;

export default function ReportStaffEnterpriseTable({ rows }: Props) {
  const [vatMode, setVatMode] = useState<VatDisplayMode>("gross");
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            Team · periodo filtrato
          </p>
          <p className="mt-1 text-sm text-white/50">
            Incassato, listino e sconti per collaboratore
          </p>
        </div>
        <ReportVatToggle mode={vatMode} onChange={setVatMode} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="bg-black/30 text-[10px] font-black uppercase tracking-wider text-white/50">
                <th className="px-3 py-3 text-left text-white/90">Collaboratore</th>
                <th className="px-3 py-3 text-right text-scz-gold/90">Incassato</th>
                <th className="px-3 py-3 text-right">Valore a listino</th>
                <th className="px-3 py-3 text-right">Sconti dati</th>
                <th className="px-3 py-3 text-right">Sconto %</th>
                <th className="px-3 py-3 text-right">Clienti</th>
                <th className="px-3 py-3 text-right">Scontrino medio</th>
                <th className="px-3 py-3 text-right">Retail venduto</th>
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
                  const highDiscount = m.discount_pct >= HIGH_DISCOUNT;
                  const lowRetail = m.real > 0 && m.retail === 0;
                  const isOpen = expanded === r.staff_id;

                  return (
                    <Fragment key={r.staff_id}>
                      <tr
                        className={`${idx % 2 === 0 ? "bg-black/10" : ""} hover:bg-black/15 cursor-pointer`}
                        onClick={() => setExpanded(isOpen ? null : r.staff_id)}
                      >
                        <td className="px-3 py-3 font-extrabold text-white">
                          #{idx + 1} {r.staff_name}
                          {highDiscount ? (
                            <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">
                              Sconto alto
                            </span>
                          ) : null}
                          {lowRetail ? (
                            <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">
                              No retail
                            </span>
                          ) : null}
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
                          {formatReportMoney(m.avg_ticket_real)}
                        </td>
                        <td className="px-3 py-3 text-right">{formatReportMoney(m.retail)}</td>
                        <td className="px-3 py-3 text-white/30 text-xs">{isOpen ? "▲" : "▼"}</td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-black/25">
                          <td colSpan={9} className="px-4 py-3 text-xs text-white/50">
                            Servizi: {r.services_qty} · Prodotti: {r.products_qty} · Scontrini:{" "}
                            {r.receipts_count} · Scontrino a listino:{" "}
                            {formatReportMoney(m.avg_ticket_full)}
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

