// components/reports/ReportAgendaStaffUtilizationTable.tsx

type Row = {
  staff_id: string | number;
  staff_name: string;
  booked_minutes: number;
  booked_hours: number;
  working_days: number;
  capacity_hours: number;
  utilization_pct: number;
};

function fmtHours(h: any) {
  const v = Number(h);
  if (!Number.isFinite(v)) return "0,0h";
  return v.toFixed(1).replace(".", ",") + "h";
}

const thBase =
  "px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b border-white/10";
const thPrimary = "text-white/90";
const thSecondary = "text-white/50";
const tdBase = "px-4 py-3 border-b border-white/5";
const tdHero = "font-extrabold text-scz-gold";
const tdSecondary = "text-white/60";

export default function ReportAgendaStaffUtilizationTable({
  rows,
}: {
  rows: Row[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
      <div className="border-b border-white/10 bg-black/20 px-6 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Saturazione staff
        </div>
        <div className="mt-1 text-sm text-white/50">
          Ore prenotate vs capacità stimata (periodo e salone).
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1000px] w-full text-sm">
          <thead>
            <tr className="bg-black/30">
              <th className={`${thBase} ${thPrimary} text-left`}>Staff</th>
              <th className={`${thBase} ${thPrimary} text-right`}>Ore prenotate</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Giorni</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Capacità</th>
              <th className={`${thBase} ${thPrimary} text-right`}>Utilizzo</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-white/40">
                  Nessun dato staff nel periodo.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr
                  key={String(r.staff_id)}
                  className={
                    idx % 2 === 0
                      ? "bg-black/10 hover:bg-black/15"
                      : "bg-transparent hover:bg-black/10"
                  }
                >
                  <td className={`${tdBase} font-extrabold text-white`}>
                    {r.staff_name}
                  </td>
                  <td className={`${tdBase} ${tdHero} text-right`}>
                    {fmtHours(r.booked_hours)}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {r.working_days}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {fmtHours(r.capacity_hours)}
                  </td>
                  <td className={`${tdBase} text-right`}>
                    <span
                      className={`font-bold ${
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
      </div>

      <div className="border-t border-white/10 bg-black/20 px-6 py-3">
        <p className="text-xs text-white/40">
          Capacità = giorni nel periodo × ore/giorno (impostazione server).
        </p>
      </div>
    </div>
  );
}
