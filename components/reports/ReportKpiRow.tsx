// components/reports/ReportKpiRow.tsx

type Totals = {
  receipts_count: number;
  gross_total: number;
  net_total: number;
  vat_total: number;
  discount_total: number;
  gross_services: number;
  gross_products: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportKpiRow({ totals }: { totals: Totals }) {
  const shell =
    "p-4 rounded-2xl bg-black/20 border border-white/10";

  const label =
    "text-[10px] font-black tracking-[0.25em] uppercase text-white/35";

  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl p-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className={shell}>
          <div className={label}>Scontrini</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.receipts_count}
          </div>
        </div>

        <div className={shell}>
          <div className={label}>Lordo</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {money(totals.gross_total)}
          </div>
        </div>

        <div className={shell}>
          <div className={label}>Netto</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {money(totals.net_total)}
          </div>
        </div>

        <div className={shell}>
          <div className={label}>IVA</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {money(totals.vat_total)}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <div className={shell}>
          <div className={label}>Sconti</div>
          <div className="text-xl font-extrabold text-white mt-1">
            {money(totals.discount_total)}
          </div>
        </div>

        <div className={shell}>
          <div className={label}>Servizi</div>
          <div className="text-xl font-extrabold text-white mt-1">
            {money(totals.gross_services)}
          </div>
        </div>

        <div className={shell}>
          <div className={label}>Prodotti</div>
          <div className="text-xl font-extrabold text-white mt-1">
            {money(totals.gross_products)}
          </div>
        </div>
      </div>
    </div>
  );
}