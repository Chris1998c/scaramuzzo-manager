// components/reports/ReportServicesKpiRow.tsx

type Totals = {
  services_qty: number;
  services_gross: number;
  avg_service_price: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportServicesKpiRow({ totals }: { totals: Totals }) {
  const card = "p-4 rounded-2xl bg-black/20 border border-white/10";
  const label = "text-[10px] font-black tracking-[0.25em] uppercase text-white/35";

  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl p-6">
      <div className="grid md:grid-cols-3 gap-4">
        <div className={card}>
          <div className={label}>Servizi (qty)</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {totals.services_qty}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Fatturato servizi</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {money(totals.services_gross)}
          </div>
        </div>

        <div className={card}>
          <div className={label}>Prezzo medio servizio</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {money(totals.avg_service_price)}
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-white/40">
        Prezzo medio = fatturato servizi / quantità servizi.
      </div>
    </div>
  );
}