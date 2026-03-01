// components/reports/ReportProductsTopTable.tsx

type Row = {
  product_id: number | string;
  product_name: string;
  qty: number;
  gross_total: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportProductsTopTable({ rows }: { rows: Row[] }) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          TOP PRODOTTI
        </div>
        <div className="text-sm text-white/50 mt-1">
          Prodotti più venduti nel periodo (pezzi + fatturato).
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Prodotto</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Pezzi</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Fatturato</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-white/40">
                  Nessun prodotto venduto nel periodo.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.product_id)}>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.product_name}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {r.qty}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {money(r.gross_total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}