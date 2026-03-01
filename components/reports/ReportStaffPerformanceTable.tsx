// components/reports/ReportStaffPerformanceTable.tsx

type StaffRow = {
  staff_id: number;
  staff_name: string;

  receipts_count: number;

  gross_total: number;
  net_total: number;
  gross_services: number;
  gross_products: number;

  services_qty: number;
  products_qty: number;

  avg_ticket: number;
  services_avg_price: number;
  products_avg_price: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportStaffPerformanceTable({ rows }: { rows: StaffRow[] }) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          STAFF (BOSS STYLE)
        </div>
        <div className="text-sm text-white/50 mt-1">
          Servizi + Prodotti + medie (scontrino e prezzo medio).
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Staff</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Scontrini</th>

              <th className="text-right px-3 py-2 border-b border-white/10">Servizi (qty)</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Prodotti (qty)</th>

              <th className="text-right px-3 py-2 border-b border-white/10">Ticket medio</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Prezzo medio serv.</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Prezzo medio prod.</th>

              <th className="text-right px-3 py-2 border-b border-white/10">Lordo</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Servizi €</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Prodotti €</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-white/40">
                  Nessun dato staff.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.staff_id}>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.staff_name}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {r.receipts_count}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {r.services_qty}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {r.products_qty}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.avg_ticket)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.services_avg_price)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.products_avg_price)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {money(r.gross_total)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.gross_services)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.gross_products)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="pt-4 text-xs text-white/40">
          Ticket medio = Lordo / Scontrini. Prezzo medio serv/prod = fatturato / quantità.
        </div>
      </div>
    </div>
  );
}