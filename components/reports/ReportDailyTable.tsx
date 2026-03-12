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

const thBase =
  "px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b border-white/10";
const thPrimary = "text-white/90";
const thSecondary = "text-white/50";
const tdBase = "px-4 py-3 border-b border-white/5";
const tdHero = "font-extrabold text-scz-gold";
const tdSecondary = "text-white/60";

export default function ReportDailyTable({
  rows,
}: {
  rows: DailyRow[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
      <div className="border-b border-white/10 bg-black/20 px-6 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Giornaliero
        </div>
        <div className="mt-1 text-sm text-white/50">
          Aggregazione per giorno nel periodo selezionato.
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[800px] w-full text-sm">
          <thead>
            <tr className="bg-black/30">
              <th className={`${thBase} ${thPrimary} text-left`}>Giorno</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Scontrini</th>
              <th className={`${thBase} ${thPrimary} text-right`}>Lordo</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Netto</th>
              <th className={`${thBase} ${thSecondary} text-right`}>IVA</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Sconti</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-white/40">
                  Nessun dato nel periodo.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr
                  key={r.day}
                  className={
                    idx % 2 === 0
                      ? "bg-black/10 hover:bg-black/15"
                      : "bg-transparent hover:bg-black/10"
                  }
                >
                  <td className={`${tdBase} font-medium text-white`}>{r.day}</td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {r.receipts_count}
                  </td>
                  <td className={`${tdBase} ${tdHero} text-right`}>
                    {money(r.gross_total)}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {money(r.net_total)}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {money(r.vat_total)}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {money(r.discount_total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-white/10 bg-black/20 px-6 py-3">
        <p className="text-xs text-white/40">
          Lordo, netto, IVA e sconti aggregati per data.
        </p>
      </div>
    </div>
  );
}
