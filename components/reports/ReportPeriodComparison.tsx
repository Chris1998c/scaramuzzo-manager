// components/reports/ReportPeriodComparison.tsx

type Totals = {
  gross_total: number;
  net_total: number;
  receipts_count: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

function pct(current: number, previous: number) {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

function GrowthBadge({ value }: { value: number }) {
  const positive = value >= 0;

  return (
    <span
      className={`ml-2 text-xs font-black px-2 py-1 rounded-full ${
        positive
          ? "bg-emerald-500/20 text-emerald-400"
          : "bg-red-500/20 text-red-400"
      }`}
    >
      {positive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

export default function ReportPeriodComparison({
  current,
  previous,
}: {
  current: Totals;
  previous: Totals;
}) {
  const grossGrowth = pct(current.gross_total, previous.gross_total);
  const netGrowth = pct(current.net_total, previous.net_total);
  const receiptsGrowth = pct(
    current.receipts_count,
    previous.receipts_count
  );

  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl p-6">
      <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
        CONFRONTO PERIODO PRECEDENTE
      </div>

      <div className="grid md:grid-cols-3 gap-6 mt-4">

        <div className="p-4 bg-black/20 border border-white/10 rounded-2xl">
          <div className="text-xs text-white/40 uppercase font-black">
            Lordo
          </div>
          <div className="text-xl font-extrabold text-white mt-1">
            {money(current.gross_total)}
            <GrowthBadge value={grossGrowth} />
          </div>
        </div>

        <div className="p-4 bg-black/20 border border-white/10 rounded-2xl">
          <div className="text-xs text-white/40 uppercase font-black">
            Netto
          </div>
          <div className="text-xl font-extrabold text-white mt-1">
            {money(current.net_total)}
            <GrowthBadge value={netGrowth} />
          </div>
        </div>

        <div className="p-4 bg-black/20 border border-white/10 rounded-2xl">
          <div className="text-xs text-white/40 uppercase font-black">
            Scontrini
          </div>
          <div className="text-xl font-extrabold text-white mt-1">
            {current.receipts_count}
            <GrowthBadge value={receiptsGrowth} />
          </div>
        </div>

      </div>
    </div>
  );
}