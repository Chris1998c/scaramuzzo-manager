// components/reports/ReportServicesTopTable.tsx

type Row = {
  key: string;              // es: "service::Taglio"
  service_id?: number | null;
  name: string;             // nome servizio
  quantity: number;         // quantità venduta
  gross_total: number;      // totale lordo
  net_total: number;        // totale netto
  avg_price?: number;       // prezzo medio lordo per servizio (opzionale)
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

export default function ReportServicesTopTable({ rows }: { rows: Row[] }) {
  const shell = "bg-scz-dark border border-white/10 rounded-2xl shadow-premium";
  const label = "text-[10px] font-black tracking-[0.25em] uppercase text-white/35";

  return (
    <div className={shell}>
      <div className="p-5 border-b border-white/10">
        <div className={label}>TOP SERVIZI</div>
        <div className="text-sm text-white/55 mt-1">
          Classifica per fatturato (lordo). Quantità e prezzo medio inclusi.
        </div>
      </div>

      <div className="p-5 overflow-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Servizio</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Q.tà</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Prezzo medio</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Netto</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Lordo</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-white/40" colSpan={5}>
                  Nessun servizio nel periodo selezionato.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const avg =
                  Number.isFinite(Number(r.avg_price))
                    ? Number(r.avg_price)
                    : r.quantity > 0
                      ? Number(r.gross_total) / Number(r.quantity)
                      : 0;

                return (
                  <tr key={r.key}>
                    <td className="px-3 py-2 border-b border-white/5">
                      <div className="font-extrabold text-white/90">{r.name}</div>
                      {r.service_id ? (
                        <div className="text-xs text-white/35">ID: {r.service_id}</div>
                      ) : null}
                    </td>

                    <td className="px-3 py-2 border-b border-white/5 text-right font-bold">
                      {Number(r.quantity ?? 0)}
                    </td>

                    <td className="px-3 py-2 border-b border-white/5 text-right">
                      {money(avg)}
                    </td>

                    <td className="px-3 py-2 border-b border-white/5 text-right">
                      {money(r.net_total)}
                    </td>

                    <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                      {money(r.gross_total)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="pt-4 text-xs text-white/40">
          Prezzo medio calcolato come (lordo / quantità) se non fornito dal backend.
        </div>
      </div>
    </div>
  );
}