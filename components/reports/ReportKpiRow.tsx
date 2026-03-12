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
  const card =
    "rounded-2xl border border-white/10 bg-black/20 p-4 md:p-5";
  const label =
    "text-[10px] font-black tracking-[0.2em] uppercase text-white/40";
  const valuePrimary = "text-2xl md:text-3xl font-extrabold text-white";
  const valueSecondary = "text-lg md:text-xl font-extrabold text-white";

  return (
    <div className="rounded-2xl border border-white/10 bg-scz-dark p-6 md:p-8">
      {/* Hero KPI: Fatturato lordo */}
      <div
        className={`${card} border-scz-gold/30 bg-gradient-to-br from-scz-gold/5 to-transparent`}
      >
        <div className={label}>Fatturato lordo</div>
        <div className={`${valuePrimary} mt-1 text-scz-gold`}>
          {money(totals.gross_total)}
        </div>
        <div className="mt-1 text-xs text-white/40">
          Periodo selezionato · filtri applicati
        </div>
      </div>

      {/* Secondary: Scontrini, Netto, IVA */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={card}>
          <div className={label}>Scontrini</div>
          <div className={`${valueSecondary} mt-1`}>
            {totals.receipts_count}
          </div>
        </div>
        <div className={card}>
          <div className={label}>Netto</div>
          <div className={`${valueSecondary} mt-1`}>
            {money(totals.net_total)}
          </div>
        </div>
        <div className={card}>
          <div className={label}>IVA</div>
          <div className={`${valueSecondary} mt-1`}>
            {money(totals.vat_total)}
          </div>
        </div>
      </div>

      {/* Tertiary: Sconti, Servizi, Prodotti */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={card}>
          <div className={label}>Sconti</div>
          <div className={`${valueSecondary} mt-1`}>
            {money(totals.discount_total)}
          </div>
        </div>
        <div className={card}>
          <div className={label}>Servizi</div>
          <div className={`${valueSecondary} mt-1`}>
            {money(totals.gross_services)}
          </div>
        </div>
        <div className={card}>
          <div className={label}>Prodotti</div>
          <div className={`${valueSecondary} mt-1`}>
            {money(totals.gross_products)}
          </div>
        </div>
      </div>
    </div>
  );
}
