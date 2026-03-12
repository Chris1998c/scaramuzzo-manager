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

function pct(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function GrowthBadge({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <span className="ml-2 rounded-full bg-black/30 px-2 py-1 text-xs font-black text-white/60">
        —
      </span>
    );
  }

  const positive = value >= 0;

  return (
    <span
      className={`ml-2 rounded-full px-2 py-1 text-xs font-black ${
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
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
      <div className="border-l-4 border-scz-gold/50 bg-black/20 px-6 py-4">
        <div className="text-xs font-black uppercase tracking-wider text-white/50">
          Confronto periodo precedente
        </div>
        <div className="mt-0.5 text-[11px] text-white/40">
          Stesso numero di giorni del periodo precedente
        </div>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs font-black uppercase tracking-wider text-white/40">
            Lordo
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-1">
            <span className="text-xl font-extrabold text-white">
              {money(current.gross_total)}
            </span>
            <GrowthBadge value={grossGrowth} />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs font-black uppercase tracking-wider text-white/40">
            Netto
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-1">
            <span className="text-xl font-extrabold text-white">
              {money(current.net_total)}
            </span>
            <GrowthBadge value={netGrowth} />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs font-black uppercase tracking-wider text-white/40">
            Scontrini
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-1">
            <span className="text-xl font-extrabold text-white">
              {current.receipts_count}
            </span>
            <GrowthBadge value={receiptsGrowth} />
          </div>
        </div>
      </div>
    </div>
  );
}
