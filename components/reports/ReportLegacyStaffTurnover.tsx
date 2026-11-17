import { formatReportMoney } from "@/components/reports/reportFormatMoney";
import type { LegacyStaffTurnoverBundle } from "@/lib/reports/getLegacyStaffTurnover";

function statusLabel(status: string, staffActive: boolean | null): string {
  if (status === "matched_inactive" || staffActive === false) return "Storico · non operativo";
  if (status === "matched_active") return "Collegato · staff attivo";
  return "Storico BOSS · senza anagrafica";
}

function displayName(row: LegacyStaffTurnoverBundle["rows"][number]): string {
  if (row.staff_name) return row.staff_name;
  return row.boss_name;
}

export default function ReportLegacyStaffTurnover({
  data,
}: {
  data: LegacyStaffTurnoverBundle;
}) {
  if (!data.rows.length) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-[#f3d8b6]/20 bg-black/25 p-4 md:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-extrabold tracking-tight text-[#f3d8b6] md:text-lg">
            Storico BOSS per collaboratore
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-white/50">
            Fatturato IVA inclusa attribuito in Boss (LAV002). Ripartizione dello stesso
            fatturato salone — non sommare ai totali Vendite. Nominativi storici restano
            consultabili senza rientrare in Agenda / App Team.
          </p>
        </div>
        <div className="text-right text-sm text-white/60">
          <div>
            Periodo storico{" "}
            <span className="font-mono text-white/80">
              {data.period_from} → {data.period_to}
            </span>
          </div>
          <div className="mt-0.5 text-[#f3d8b6]">
            Totale attribuito {formatReportMoney(data.total_gross)}
          </div>
        </div>
      </div>

      {data.period_note ? (
        <p className="text-xs text-amber-100/70">{data.period_note}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-[720px] w-full text-sm">
          <thead>
            <tr className="bg-black/30 text-xs font-medium text-white/50">
              <th className="px-3 py-2.5 text-left">Collaboratore</th>
              <th className="px-3 py-2.5 text-left">Codice BOSS</th>
              <th className="px-3 py-2.5 text-left">Stato</th>
              <th className="px-3 py-2.5 text-right">Servizi</th>
              <th className="px-3 py-2.5 text-right">Prodotti</th>
              <th className="px-3 py-2.5 text-right text-[#f3d8b6]/90">Totale IVA incl.</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5 text-white/85">
                <td className="px-3 py-2.5 font-medium">
                  {displayName(r)}
                  {r.staff_name && r.staff_name !== r.boss_name ? (
                    <span className="mt-0.5 block text-xs font-normal text-white/40">
                      BOSS: {r.boss_name}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 font-mono text-white/60">{r.boss_code}</td>
                <td className="px-3 py-2.5 text-xs text-white/55">
                  {statusLabel(r.match_status, r.staff_active)}
                </td>
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
