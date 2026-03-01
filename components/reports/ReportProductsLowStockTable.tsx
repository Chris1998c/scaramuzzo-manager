// components/reports/ReportProductsLowStockTable.tsx

type Row = {
  product_id: number | string;
  product_name: string;
  qty_on_hand: number;
  min_qty: number;
  deficit: number; // min_qty - qty_on_hand
};

export default function ReportProductsLowStockTable({ rows }: { rows: Row[] }) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          GIACENZE CRITICHE
        </div>
        <div className="text-sm text-white/50 mt-1">
          Prodotti sotto soglia minima (riordino consigliato).
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Prodotto</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Giacenza</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Soglia</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Mancano</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-white/40">
                  Nessuna giacenza critica nel salone selezionato.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.product_id)}>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.product_name}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {r.qty_on_hand}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {r.min_qty}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    <span className="text-red-300 font-black">
                      {r.deficit}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="pt-4 text-xs text-white/40">
          La soglia minima (min_qty) sarà configurabile; per ora è gestita dal server.
        </div>
      </div>
    </div>
  );
}