// components/reports/ReportProductsKpiRow.tsx

type Totals = {
  products_qty: number;
  products_gross: number;
  low_stock_count: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportProductsKpiRow({ totals }: { totals: Totals }) {
  const card = "p-4 rounded-2xl bg-black/20 border border-white/10";
  const label = "text-[10px] font-black tracking-[0.25em] uppercase text-white/35";

  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl p-6">
      <div className="grid md:grid-cols-3 gap-4">
        <div className={card}>
          <div className={label}>Pezzi venduti</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.products_qty}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Fatturato prodotti</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {money(totals.products_gross)}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Giacenze critiche</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.low_stock_count}
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-white/40">
        “Giacenze critiche” = prodotti sotto soglia minima (config server).
      </div>
    </div>
  );
}