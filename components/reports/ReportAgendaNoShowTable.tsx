// components/reports/ReportAgendaNoShowTable.tsx

type Row = {
  day: string; // YYYY-MM-DD
  appointments: number;
  done: number;
  no_show: number;
  cancelled: number;
  completion_rate: number; // 0..100
};

export default function ReportAgendaNoShowTable({ rows }: { rows: Row[] }) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          NO-SHOW & CANCELLAZIONI
        </div>
        <div className="text-sm text-white/50 mt-1">
          Andamento per giorno nel periodo selezionato.
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Giorno</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Appunt.</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Done</th>
              <th className="text-right px-3 py-2 border-b border-white/10">No-show</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Cancel</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Completion</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-white/40">
                  Nessun appuntamento nel periodo.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.day}>
                  <td className="px-3 py-2 border-b border-white/5">{r.day}</td>
                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {r.appointments}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {r.done}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    <span className={r.no_show > 0 ? "text-red-300 font-black" : ""}>
                      {r.no_show}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    <span className={r.cancelled > 0 ? "text-amber-300 font-black" : ""}>
                      {r.cancelled}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    <span
                      className={`font-black ${
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

        <div className="pt-4 text-xs text-white/40">
          Completion = Done / Appuntamenti totali (nel giorno).
        </div>
      </div>
    </div>
  );
}