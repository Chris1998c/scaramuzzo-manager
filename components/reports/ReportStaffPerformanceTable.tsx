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

const thBase =
  "px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider border-b border-white/10";
const thPrimary = "text-white/90";
const thSecondary = "text-white/50";

const tdBase = "px-4 py-3 border-b border-white/5";
const tdPrimary = "font-extrabold text-white";
const tdHero = "font-extrabold text-scz-gold";
const tdSecondary = "text-white/60";

export default function ReportStaffPerformanceTable({ rows }: { rows: StaffRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
      <div className="border-b border-white/10 bg-black/20 px-6 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Performance staff
        </div>
        <div className="mt-1 text-sm text-white/50">
          Servizi + Prodotti · ticket medio e prezzi medi
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead>
            <tr className="bg-black/30">
              <th className={`${thBase} ${thPrimary} w-[1%] whitespace-nowrap`}>
                #
              </th>
              <th className={`${thBase} ${thPrimary} min-w-[140px]`}>
                Staff
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                Scontrini
              </th>
              <th className={`${thBase} ${thPrimary} text-right`}>
                Servizi
              </th>
              <th className={`${thBase} ${thPrimary} text-right`}>
                Prodotti
              </th>
              <th className={`${thBase} ${thPrimary} text-right`}>
                Ticket medio
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                € medio serv.
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                € medio prod.
              </th>
              <th className={`${thBase} ${thPrimary} text-right min-w-[100px]`}>
                Lordo
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                Servizi €
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                Prodotti €
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-12 text-center text-white/40"
                >
                  Nessun dato staff nel periodo selezionato.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr
                  key={r.staff_id}
                  className={
                    idx % 2 === 0
                      ? "bg-black/10 hover:bg-black/15"
                      : "bg-transparent hover:bg-black/10"
                  }
                >
                  <td className={`${tdBase} text-white/50 font-bold`}>
                    #{idx + 1}
                  </td>
                  <td className={`${tdBase} ${tdPrimary}`}>
                    <span className="font-extrabold text-white">
                      {r.staff_name}
                    </span>
                  </td>

                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {r.receipts_count}
                  </td>

                  <td className={`${tdBase} ${tdPrimary} text-right`}>
                    {r.services_qty}
                  </td>
                  <td className={`${tdBase} ${tdPrimary} text-right`}>
                    {r.products_qty}
                  </td>

                  <td className={`${tdBase} ${tdPrimary} text-right`}>
                    {money(r.avg_ticket)}
                  </td>

                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {money(r.services_avg_price)}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {money(r.products_avg_price)}
                  </td>

                  <td className={`${tdBase} ${tdHero} text-right`}>
                    {money(r.gross_total)}
                  </td>

                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {money(r.gross_services)}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {money(r.gross_products)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-white/10 bg-black/20 px-6 py-3">
        <p className="text-xs text-white/40">
          Ticket medio = Lordo ÷ Scontrini · Prezzo medio = fatturato ÷ quantità
        </p>
      </div>
    </div>
  );
}
