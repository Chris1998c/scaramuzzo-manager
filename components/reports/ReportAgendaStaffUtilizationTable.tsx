// components/reports/ReportAgendaStaffUtilizationTable.tsx

type Row = {
  staff_id: string | number;
  staff_name: string;
  booked_minutes: number;     // minuti prenotati nel periodo
  booked_hours: number;       // ore prenotate (computed)
  working_days: number;       // giorni lavorativi (computed)
  capacity_hours: number;     // capacità stimata (working_days * daily_capacity_hours)
  utilization_pct: number;    // booked_hours / capacity_hours * 100
};

function fmtHours(h: any) {
  const v = Number(h);
  if (!Number.isFinite(v)) return "0,0h";
  return v.toFixed(1).replace(".", ",") + "h";
}

export default function ReportAgendaStaffUtilizationTable({
  rows,
}: {
  rows: Row[];
}) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          SATURAZIONE STAFF
        </div>
        <div className="text-sm text-white/50 mt-1">
          Ore prenotate vs capacità stimata (per periodo e salone).
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Staff</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Ore prenotate</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Giorni</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Capacità</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Utilizzo</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-white/40">
                  Nessun dato staff nel periodo.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.staff_id)}>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.staff_name}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {fmtHours(r.booked_hours)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {r.working_days}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {fmtHours(r.capacity_hours)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    <span
                      className={`font-black ${
                        r.utilization_pct >= 80
                          ? "text-emerald-300"
                          : r.utilization_pct >= 50
                          ? "text-amber-300"
                          : "text-red-300"
                      }`}
                    >
                      {Math.round(r.utilization_pct)}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="pt-4 text-xs text-white/40">
          “Capacità” = giorni nel periodo × ore/giorno (impostazione server). Se vuoi precisione totale,
          poi la colleghiamo ai turni reali.
        </div>
      </div>
    </div>
  );
}