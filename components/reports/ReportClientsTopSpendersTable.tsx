// components/reports/ReportClientsTopSpendersTable.tsx

type Row = {
  customer_id: string;
  customer_name: string;
  visits: number;
  gross_total: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportClientsTopSpendersTable({
  rows,
}: {
  rows: Row[];
}) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          TOP SPENDER
        </div>
        <div className="text-sm text-white/50 mt-1">
          Clienti con più spesa nel periodo.
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Cliente</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Visite</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Spesa</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-white/40">
                  Nessun dato clienti nel periodo.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.customer_id}>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.customer_name}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {r.visits}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {money(r.gross_total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="pt-4 text-xs text-white/40">
          Nota: la spesa è calcolata sulle vendite (sales) nel periodo.
        </div>
      </div>
    </div>
  );
}