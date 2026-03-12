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

const thBase =
  "px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b border-white/10";
const thPrimary = "text-white/90";
const thSecondary = "text-white/50";
const tdBase = "px-4 py-3 border-b border-white/5";
const tdHero = "font-extrabold text-scz-gold";
const tdSecondary = "text-white/60";

export default function ReportProductsTopTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
      <div className="border-b border-white/10 bg-black/20 px-6 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Top prodotti
        </div>
        <div className="mt-1 text-sm text-white/50">
          Prodotti più venduti nel periodo (pezzi + fatturato).
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="bg-black/30">
              <th className={`${thBase} ${thPrimary} text-left min-w-[220px]`}>
                Prodotto
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>Pezzi</th>
              <th className={`${thBase} ${thPrimary} text-right min-w-[120px]`}>
                Fatturato
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-12 text-center text-white/40"
                >
                  Nessun prodotto venduto nel periodo.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr
                  key={String(r.product_id)}
                  className={
                    idx % 2 === 0
                      ? "bg-black/10 hover:bg-black/15"
                      : "bg-transparent hover:bg-black/10"
                  }
                >
                  <td className={`${tdBase} font-extrabold text-white`}>
                    {r.product_name}
                  </td>
                  <td
                    className={`${tdBase} ${tdSecondary} text-right whitespace-nowrap`}
                  >
                    {r.qty}
                  </td>
                  <td
                    className={`${tdBase} ${tdHero} text-right whitespace-nowrap`}
                  >
                    {money(r.gross_total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-white/10 bg-black/20 px-6 py-3">
        <p className="text-xs text-white/40">
          Fatturato calcolato sul lordo prodotti venduti nel periodo.
        </p>
      </div>
    </div>
  );
}