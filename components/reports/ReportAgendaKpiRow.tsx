// components/reports/ReportAgendaKpiRow.tsx

type Totals = {
  appointments: number;
  done: number;
  no_show: number;
  cancelled: number;
  in_sala: number;
  completion_rate: number; // 0..100
};

export default function ReportAgendaKpiRow({ totals }: { totals: Totals }) {
  const card = "p-4 rounded-2xl bg-black/20 border border-white/10";
  const label = "text-[10px] font-black tracking-[0.25em] uppercase text-white/35";

  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl p-6">
      <div className="grid md:grid-cols-5 gap-4">
        <div className={card}>
          <div className={label}>Appuntamenti</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.appointments}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Completati</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.done}
          </div>
        </div>

        <div className={card}>
          <div className={label}>No-show</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.no_show}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Cancellati</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.cancelled}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Completion %</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {Math.round(totals.completion_rate)}%
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-white/40">
        Nota: “Completion %” = completati / (appuntamenti totali) nel periodo.
      </div>
    </div>
  );
}