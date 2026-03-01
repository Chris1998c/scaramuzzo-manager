// components/reports/ReportClientsKpiRow.tsx

type Totals = {
  customers_total: number;
  new_customers: number;
  returning_customers: number;
  repeat_rate: number; // 0..100
};

export default function ReportClientsKpiRow({ totals }: { totals: Totals }) {
  const card = "p-4 rounded-2xl bg-black/20 border border-white/10";
  const label = "text-[10px] font-black tracking-[0.25em] uppercase text-white/35";

  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl p-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className={card}>
          <div className={label}>Clienti (periodo)</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.customers_total}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Nuovi</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.new_customers}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Ritorno</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.returning_customers}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Repeat %</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {Math.round(totals.repeat_rate)}%
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-white/40">
        Repeat % = clienti con almeno 2 appuntamenti nel periodo / clienti del periodo.
      </div>
    </div>
  );
}