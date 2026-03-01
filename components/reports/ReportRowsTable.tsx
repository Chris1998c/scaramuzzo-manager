// components/reports/ReportRowsTable.tsx

type Row = {
  sale_item_id: number;
  sale_id: number;
  sale_day: string;
  payment_method: string;
  staff_name: string | null;
  product_name: string | null;
  service_name: string | null;
  item_type: string;
  quantity: number | null;
  price: number;
  item_discount: number | null;
  line_total_gross: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportRowsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          DETTAGLIO RIGHE
        </div>
        <div className="text-sm text-white/50 mt-1">
          Prime 400 righe del periodo selezionato.
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Data</th>
              <th className="text-left px-3 py-2 border-b border-white/10">Scontrino</th>
              <th className="text-left px-3 py-2 border-b border-white/10">Tipo</th>
              <th className="text-left px-3 py-2 border-b border-white/10">Nome</th>
              <th className="text-left px-3 py-2 border-b border-white/10">Staff</th>
              <th className="text-left px-3 py-2 border-b border-white/10">Pagamento</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Q.tà</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Prezzo</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Sconto</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Lordo</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-white/40">
                  Nessun dato per il periodo selezionato.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.sale_item_id}>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.sale_day}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5">
                    #{r.sale_id}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.item_type === "product" ? "Prodotto" : "Servizio"}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.item_type === "product"
                      ? r.product_name ?? "Prodotto"
                      : r.service_name ?? "Servizio"}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.staff_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.payment_method === "cash" ? "Contanti" : "Carta"}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {r.quantity ?? 1}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.price)}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.item_discount ?? 0)}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {money(r.line_total_gross)}
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