// components/reports/ReportCashKpiRow.tsx

type Totals = {
  sessions: number;
  gross_total: number;
  gross_cash: number;
  gross_card: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportCashKpiRow({ totals }: { totals: Totals }) {
  const card = "p-4 rounded-2xl bg-black/20 border border-white/10";
  const label = "text-[10px] font-black tracking-[0.25em] uppercase text-white/35";

  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl p-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className={card}>
          <div className={label}>Sessioni</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.sessions}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Lordo</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {money(totals.gross_total)}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Contanti</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {money(totals.gross_cash)}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Carta</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {money(totals.gross_card)}
          </div>
        </div>
      </div>
    </div>
  );
}