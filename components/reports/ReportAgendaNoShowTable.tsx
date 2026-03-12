// components/reports/ReportAgendaNoShowTable.tsx

type Row = {
  day: string;
  appointments: number;
  done: number;
  no_show: number;
  cancelled: number;
  completion_rate: number;
};

const thBase =
  "px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b border-white/10";
const thPrimary = "text-white/90";
const thSecondary = "text-white/50";
const tdBase = "px-4 py-3 border-b border-white/5";
const tdSecondary = "text-white/60";

export default function ReportAgendaNoShowTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
      <div className="border-b border-white/10 bg-black/20 px-6 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          No-show e cancellazioni
        </div>
        <div className="mt-1 text-sm text-white/50">
          Andamento per giorno nel periodo selezionato.
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="bg-black/30">
              <th className={`${thBase} ${thPrimary} text-left`}>Giorno</th>
              <th className={`${thBase} ${thPrimary} text-right`}>Appunt.</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Done</th>
              <th className={`${thBase} ${thSecondary} text-right`}>No-show</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Cancel</th>
              <th className={`${thBase} ${thPrimary} text-right`}>Completion</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-white/40">
                  Nessun appuntamento nel periodo.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr
                  key={r.day}
                  className={
                    idx % 2 === 0
                      ? "bg-black/10 hover:bg-black/15"
                      : "bg-transparent hover:bg-black/10"
                  }
                >
                  <td className={`${tdBase} font-medium text-white`}>{r.day}</td>
                  <td className={`${tdBase} text-right font-extrabold text-scz-gold`}>
                    {r.appointments}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>{r.done}</td>
                  <td className={`${tdBase} text-right`}>
                    <span className={r.no_show > 0 ? "font-bold text-red-300" : tdSecondary}>
                      {r.no_show}
                    </span>
                  </td>
                  <td className={`${tdBase} text-right`}>
                    <span className={r.cancelled > 0 ? "font-bold text-amber-300" : tdSecondary}>
                      {r.cancelled}
                    </span>
                  </td>
                  <td className={`${tdBase} text-right`}>
                    <span
                      className={`font-bold ${
                        r.completion_rate >= 80
                          ? "text-emerald-300"
                          : r.completion_rate >= 50
                            ? "text-amber-300"
                            : "text-red-300"
                      }`}
                    >
                      {Math.round(r.completion_rate)}%
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
          Completion = Done ÷ Appuntamenti totali (nel giorno).
        </p>
      </div>
    </div>
  );
}
