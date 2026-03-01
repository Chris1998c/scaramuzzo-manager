// components/reports/ReportTopItemsTable.tsx

type TopItem = {
  key: string;
  item_type: string;
  name: string;
  quantity: number;
  gross_total: number;
  net_total: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportTopItemsTable({
  rows,
}: {
  rows: TopItem[];
}) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          TOP ITEMS
        </div>
        <div className="text-sm text-white/50 mt-1">
          Prodotti e servizi con maggior fatturato.
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Tipo</th>
              <th className="text-left px-3 py-2 border-b border-white/10">Nome</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Q.tà</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Netto</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Lordo</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-white/40">
                  Nessun dato.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.item_type === "product" ? "Prodotto" : "Servizio"}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.name}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {r.quantity}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.net_total)}
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