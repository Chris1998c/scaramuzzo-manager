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
  // ISO -> "YYYY-MM-DD HH:mm"
  return iso.replace("T", " ").slice(0, 16);
}

export default function ReportCashSessionsTable({
  rows,
}: {
  rows: CashSessionRow[];
}) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          CASSA
        </div>
        <div className="text-sm text-white/50 mt-1">
          Sessioni di cassa (aperture/chiusure) e totali.
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Stato</th>
              <th className="text-left px-3 py-2 border-b border-white/10">Apertura</th>
              <th className="text-left px-3 py-2 border-b border-white/10">Chiusura</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Lordo</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Contanti</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Carta</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Contanti dichiarati</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Differenza</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-white/40">
                  Nessuna sessione di cassa nel periodo selezionato.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)}>
                  <td className="px-3 py-2 border-b border-white/5">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-black border ${
                        r.status === "open"
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
                          : "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                      }`}
                    >
                      {r.status === "open" ? "APERTA" : "CHIUSA"}
                    </span>
                  </td>

                  <td className="px-3 py-2 border-b border-white/5">
                    {fmtDt(r.opened_at)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5">
                    {fmtDt(r.closed_at)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {money(r.gross_total)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.gross_cash)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {money(r.gross_card)}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {r.declared_cash ? money(r.declared_cash) : "—"}
                  </td>

                  <td className="px-3 py-2 border-b border-white/5 text-right">
                    {Number.isFinite(Number(r.cash_difference)) && r.cash_difference !== 0 ? (
                      <span
                        className={`font-black ${
                          r.cash_difference > 0 ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {money(r.cash_difference)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="pt-4 text-xs text-white/40">
          Nota: la “Differenza” appare solo se esiste un valore dichiarato o un campo differenza salvato.
        </div>
      </div>
    </div>
  );
}