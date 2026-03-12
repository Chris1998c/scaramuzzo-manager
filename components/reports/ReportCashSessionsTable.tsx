// components/reports/ReportCashSessionsTable.tsx

type CashSessionRow = {
  id: number | string;
  opened_at: string;
  closed_at: string | null;
  status: "open" | "closed";
  gross_total: number;
  gross_cash: number;
  gross_card: number;
  declared_cash: number;
  cash_difference: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

function fmtDt(iso: string | null) {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}

const thBase =
  "px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b border-white/10";
const thPrimary = "text-white/90";
const thSecondary = "text-white/50";
const tdBase = "px-4 py-3 border-b border-white/5";
const tdHero = "font-extrabold text-scz-gold";
const tdSecondary = "text-white/60";

export default function ReportCashSessionsTable({
  rows,
}: {
  rows: CashSessionRow[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
      <div className="border-b border-white/10 bg-black/20 px-6 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Cassa
        </div>
        <div className="mt-1 text-sm text-white/50">
          Sessioni di cassa (aperture/chiusure) e totali nel periodo.
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead>
            <tr className="bg-black/30">
              <th className={`${thBase} ${thPrimary} text-left`}>Stato</th>
              <th className={`${thBase} ${thSecondary} text-left`}>Apertura</th>
              <th className={`${thBase} ${thSecondary} text-left`}>Chiusura</th>
              <th className={`${thBase} ${thPrimary} text-right`}>Lordo</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Contanti</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Carta</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Dichiarati</th>
              <th className={`${thBase} ${thSecondary} text-right`}>Differenza</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-white/40">
                  Nessuna sessione di cassa nel periodo selezionato.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr
                  key={String(r.id)}
                  className={
                    idx % 2 === 0
                      ? "bg-black/10 hover:bg-black/15"
                      : "bg-transparent hover:bg-black/10"
                  }
                >
                  <td className={tdBase}>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${
                        r.status === "open"
                          ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                          : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                      }`}
                    >
                      {r.status === "open" ? "Aperta" : "Chiusa"}
                    </span>
                  </td>
                  <td className={`${tdBase} ${tdSecondary}`}>{fmtDt(r.opened_at)}</td>
                  <td className={`${tdBase} ${tdSecondary}`}>{fmtDt(r.closed_at)}</td>
                  <td className={`${tdBase} ${tdHero} text-right`}>
                    {money(r.gross_total)}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {money(r.gross_cash)}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {money(r.gross_card)}
                  </td>
                  <td className={`${tdBase} ${tdSecondary} text-right`}>
                    {r.declared_cash != null ? money(r.declared_cash) : "—"}
                  </td>
                  <td className={`${tdBase} text-right`}>
                    {Number.isFinite(Number(r.cash_difference)) && r.cash_difference !== 0 ? (
                      <span
                        className={`font-bold ${
                          r.cash_difference > 0 ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {money(r.cash_difference)}
                      </span>
                    ) : (
                      <span className={tdSecondary}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-white/10 bg-black/20 px-6 py-3">
        <p className="text-xs text-white/40">
          La differenza appare solo se è presente un valore dichiarato o salvato.
        </p>
      </div>
    </div>
  );
}
