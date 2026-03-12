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

const thBase =
  "px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b border-white/10";
const thPrimary = "text-white/90";
const thSecondary = "text-white/50";

const tdBase = "px-4 py-3 border-b border-white/5";
const tdHero = "font-extrabold text-scz-gold";
const tdPrimary = "text-white font-medium";
const tdSecondary = "text-white/60";

export default function ReportClientsTopSpendersTable({
  rows,
}: {
  rows: Row[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
      <div className="border-b border-white/10 bg-black/20 px-6 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Top spender
        </div>
        <div className="mt-1 text-sm text-white/50">
          Clienti con più spesa nel periodo (per CRM e fidelizzazione).
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[800px] w-full text-sm">
          <thead>
            <tr className="bg-black/30">
              <th className={`${thBase} ${thPrimary} w-[1%] whitespace-nowrap`}>
                #
              </th>
              <th className={`${thBase} ${thPrimary} text-left min-w-[220px]`}>
                Cliente
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                Visite
              </th>
              <th className={`${thBase} ${thPrimary} text-right min-w-[120px]`}>
                Spesa
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-white/40"
                >
                  Nessun dato clienti nel periodo.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => {
                const isTop = idx < 3;

                return (
                  <tr
                    key={r.customer_id}
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
                          {r.customer_name}
                        </span>
                        {isTop && (
                          <span className="inline-flex rounded-full bg-scz-gold/15 px-2 py-0.5 text-[11px] font-semibold text-scz-gold">
                            Top client
                          </span>
                        )}
                      </div>
                    </td>

                    <td
                      className={`${tdBase} ${tdSecondary} text-right whitespace-nowrap`}
                    >
                      {r.visits}
                    </td>

                    <td
                      className={`${tdBase} ${tdHero} text-right whitespace-nowrap`}
                    >
                      {money(r.gross_total)}
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
          La spesa è calcolata sulle vendite (sales) nel periodo selezionato.
        </p>
      </div>
    </div>
  );
}