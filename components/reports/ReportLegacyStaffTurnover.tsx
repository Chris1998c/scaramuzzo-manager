import { formatReportMoney } from "@/components/reports/reportFormatMoney";
import type { LegacyStaffTurnoverBundle } from "@/lib/reports/getLegacyStaffTurnover";

export default function ReportLegacyStaffTurnover({
  data,
}: {
  data: LegacyStaffTurnoverBundle;
}) {
  if (!data.rows.length) return null;

  const pendingPeriod = !data.period_confirmed;

  return (
    <section className="space-y-3 rounded-2xl border border-[#f3d8b6]/20 bg-black/25 p-4 md:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-extrabold tracking-tight text-[#f3d8b6] md:text-lg">
            Storico BOSS da verificare
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-white/50">
            Nominativi e codici dal file LAV002 (IVA inclusa). Non sono collegati allo staff
            operativo, all&apos;Agenda né all&apos;App Team. Non sommare ai totali Vendite né ai
            KPI Team del periodo filtrato.
          </p>
        </div>
        <div className="text-right text-sm text-white/60">
          {pendingPeriod ? (
            <div className="text-amber-100/80">Periodo BOSS non confermato</div>
          ) : (
            <div>
              Periodo{" "}
              <span className="font-mono text-white/80">
                {data.period_from} → {data.period_to}
              </span>
            </div>
          )}
          <div className="mt-0.5 text-[#f3d8b6]">
            Totale file {formatReportMoney(data.total_gross)}
          </div>
        </div>
      </div>

      {data.period_note ? (
        <p className="text-xs text-amber-100/70">{data.period_note}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-[640px] w-full text-sm">
          <thead>
            <tr className="bg-black/30 text-xs font-medium text-white/50">
              <th className="px-3 py-2.5 text-left">Nominativo storico</th>
              <th className="px-3 py-2.5 text-left">Codice BOSS</th>
              <th className="px-3 py-2.5 text-right">Servizi</th>
              <th className="px-3 py-2.5 text-right">Prodotti</th>
              <th className="px-3 py-2.5 text-right text-[#f3d8b6]/90">Totale IVA incl.</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5 text-white/85">
                <td className="px-3 py-2.5 font-medium">{r.boss_name}</td>
                <td className="px-3 py-2.5 font-mono text-white/60">{r.boss_code}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatReportMoney(r.services_gross)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatReportMoney(r.products_gross)}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#f3d8b6]">
                  {formatReportMoney(r.amount_gross)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
