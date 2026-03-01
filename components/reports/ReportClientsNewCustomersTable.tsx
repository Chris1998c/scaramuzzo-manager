// components/reports/ReportClientsNewCustomersTable.tsx

type Row = {
  customer_id: string;
  customer_name: string;
  first_visit_day: string; // YYYY-MM-DD
  visits_in_period: number;
};

export default function ReportClientsNewCustomersTable({
  rows,
}: {
  rows: Row[];
}) {
  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35">
          NUOVI CLIENTI
        </div>
        <div className="text-sm text-white/50 mt-1">
          Clienti con prima visita nel periodo selezionato.
        </div>
      </div>

      <div className="p-6 overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-3 py-2 border-b border-white/10">Cliente</th>
              <th className="text-left px-3 py-2 border-b border-white/10">Prima visita</th>
              <th className="text-right px-3 py-2 border-b border-white/10">Visite (periodo)</th>
            </tr>
          </thead>

          <tbody className="text-white/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-white/40">
                  Nessun nuovo cliente nel periodo.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.customer_id}>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.customer_name}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5">
                    {r.first_visit_day}
                  </td>
                  <td className="px-3 py-2 border-b border-white/5 text-right font-extrabold">
                    {r.visits_in_period}
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