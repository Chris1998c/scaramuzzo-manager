// components/reports/ReportDailyTable.tsx

type DailyRow = {
  day: string;
  receipts_count: number;
  gross_total: number;
  net_total: number;
  vat_total: number;
  discount_total: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportDailyTable({
  rows,
}: {
  rows: DailyRow[];
}) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          GIORNALIERO
        </div>
        <div className="text-sm text-white/50 mt-1">
          Aggregazione per giorno.
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[800px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Giorno</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Scontrini</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Lordo</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Netto</th>
              <th className="text-right px-3 py-2 border-b border-white/10">IVA</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Sconti</th>
            </tr>
          </thead>
          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-white/40">
                  Nessun dato.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.day}>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.day}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {r.receipts_count}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {money(r.gross_total)}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.net_total)}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.vat_total)}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.discount_total)}
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