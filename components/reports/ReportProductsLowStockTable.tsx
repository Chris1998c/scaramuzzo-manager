// components/reports/ReportProductsLowStockTable.tsx

type Row = {
  product_id: number | string;
  product_name: string;
  qty_on_hand: number;
  min_qty: number;
  deficit: number; // min_qty - qty_on_hand
};

const thBase =
  "px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b border-white/10";
const thPrimary = "text-white/90";
const thSecondary = "text-white/50";

const tdBase = "px-4 py-3 border-b border-white/5";
const tdPrimary = "text-white font-medium";
const tdSecondary = "text-white/60";
const tdHero = "font-extrabold text-scz-gold";

function severity(deficit: number, min_qty: number) {
  if (deficit <= 0) return { label: null as string | null, className: "" };
  const ratio = min_qty > 0 ? deficit / min_qty : 1;
  if (ratio >= 1.5) {
    return {
      label: "Molto critico",
      className: "bg-red-500/20 text-red-300",
    };
  }
  return {
    label: "Critico",
    className: "bg-amber-500/20 text-amber-200",
  };
}

export default function ReportProductsLowStockTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
      <div className="border-b border-white/10 bg-black/20 px-6 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Giacenze critiche
        </div>
        <div className="mt-1 text-sm text-white/50">
          Prodotti sotto soglia minima (priorità riordino).
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="bg-black/30">
              <th className={`${thBase} ${thPrimary} w-[1%] whitespace-nowrap`}>
                #
              </th>
              <th className={`${thBase} ${thPrimary} text-left min-w-[220px]`}>
                Prodotto
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                Giacenza
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                Soglia
              </th>
              <th className={`${thBase} ${thPrimary} text-right min-w-[110px]`}>
                Mancano
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-white/40"
                >
                  Nessuna giacenza critica nel salone selezionato.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => {
                const sev = severity(r.deficit, r.min_qty);

                return (
                  <tr
                    key={String(r.product_id)}
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
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white">
                          {r.product_name}
                        </span>
                        {sev.label && (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${sev.className}`}
                          >
                            {sev.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className={`${tdBase} ${tdSecondary} text-right whitespace-nowrap`}
                    >
                      {r.qty_on_hand}
                    </td>
                    <td
                      className={`${tdBase} ${tdSecondary} text-right whitespace-nowrap`}
                    >
                      {r.min_qty}
                    </td>
                    <td
                      className={`${tdBase} ${tdHero} text-right whitespace-nowrap`}
                    >
                      {r.deficit}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-white/10 bg-black/20 px-6 py-3">
        <p className="text-xs text-white/40">
          Suggerimento: riordina partendo dai prodotti in cima alla lista (deficit
          maggiore).
        </p>
      </div>
    </div>
  );
}