"use client";

import { useState } from "react";
import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";
import ReportVatToggle from "@/components/reports/ReportVatToggle";
import { formatReportMoney } from "@/components/reports/reportFormatMoney";

type Props = {
  rows: StaffKpiRow[];
};

const th =
  "px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider border-b border-white/10 text-white/50";
const td = "px-3 py-3 border-b border-white/5 text-sm";

export default function ReportStaffEnterpriseTable({ rows }: Props) {
  const [vatMode, setVatMode] = useState<VatDisplayMode>("gross");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            Performance collaboratori
          </p>
          <p className="mt-1 text-sm text-white/50">
            Incasso reale vs valore pieno · sconti separati
          </p>
        </div>
        <ReportVatToggle mode={vatMode} onChange={setVatMode} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full text-sm">
            <thead>
              <tr className="bg-black/30">
                <th className={`${th} text-white/90`}>Collaboratore</th>
                <th className={`${th} text-right`}>Clienti</th>
                <th className={`${th} text-right`}>Servizi</th>
                <th className={`${th} text-right`}>Prodotti</th>
                <th className={`${th} text-right text-scz-gold/90`}>Incasso reale</th>
                <th className={`${th} text-right`}>Valore pieno</th>
                <th className={`${th} text-right`}>Sconti</th>
                <th className={`${th} text-right`}>% sconto</th>
                <th className={`${th} text-right`}>Ticket reale</th>
                <th className={`${th} text-right`}>Ticket teorico</th>
                <th className={`${th} text-right`}>Retail</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-white/40">
                    Nessun dato staff nel periodo selezionato.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  const m = pickStaffMoney(r, vatMode);
                  return (
                    <tr
                      key={r.staff_id}
                      className={
                        idx % 2 === 0
                          ? "bg-black/10 hover:bg-black/15"
                          : "bg-transparent hover:bg-black/10"
                      }
                    >
                      <td className={`${td} font-extrabold text-white`}>{r.staff_name}</td>
                      <td className={`${td} text-right text-white/70`}>
                        {r.customers_served}
                      </td>
                      <td className={`${td} text-right font-bold text-white`}>
                        {r.services_qty}
                      </td>
                      <td className={`${td} text-right font-bold text-white`}>
                        {r.products_qty}
                      </td>
                      <td className={`${td} text-right font-extrabold text-scz-gold`}>
                        {formatReportMoney(m.real)}
                      </td>
                      <td className={`${td} text-right text-white/80`}>
                        {formatReportMoney(m.full)}
                      </td>
                      <td className={`${td} text-right text-amber-200/90`}>
                        {formatReportMoney(m.discount)}
                      </td>
                      <td className={`${td} text-right text-white/60`}>
                        {m.discount_pct.toFixed(1)}%
                      </td>
                      <td className={`${td} text-right text-white/80`}>
                        {formatReportMoney(m.avg_ticket_real)}
                      </td>
                      <td className={`${td} text-right text-white/50`}>
                        {formatReportMoney(m.avg_ticket_full)}
                      </td>
                      <td className={`${td} text-right text-white/70`}>
                        {formatReportMoney(m.retail)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/10 bg-black/20 px-6 py-3">
          <p className="text-xs text-white/40">
            {vatMode === "gross" ? "Con IVA" : "Senza IVA"} · Valore pieno = prezzo listino ×
            quantità · Incasso reale = dopo sconto riga · Clienti = distinct customer_id su
            scontrini con staff (0 se vendita senza cliente).
          </p>
        </div>
      </div>
    </div>
  );
}
