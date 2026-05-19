import type { FiscalPrintJobDashboardRow } from "@/lib/fiscal/fetchFiscalPrintJobsDashboard";
import FiscalJobRowActions from "@/components/fiscal/FiscalJobRowActions";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("it-IT");
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const styles: Record<string, string> = {
    pending:
      "border-amber-500/30 bg-amber-500/10 text-amber-200/95",
    processing:
      "border-sky-500/30 bg-sky-500/10 text-sky-200/95",
    completed:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/95",
    failed: "border-red-500/30 bg-red-500/10 text-red-200/95",
    cancelled:
      "border-white/20 bg-white/5 text-white/60",
  };
  const cls = styles[s] ?? "border-white/20 bg-white/5 text-white/70";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${cls}`}
    >
      {status || "—"}
    </span>
  );
}

type Props = {
  rows: FiscalPrintJobDashboardRow[];
  loadError: string | null;
  canAct: boolean;
};

export default function FiscalJobsTable({ rows, loadError, canAct }: Props) {
  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-6 text-center text-sm text-red-200/90">
        Errore caricamento job: {loadError}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-8 text-center text-sm text-white/55">
        Nessun job fiscale trovato con i filtri correnti.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)]">
      <div className="border-b border-white/10 bg-black/20 px-5 py-3.5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Ultimi job ({rows.length})
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-black/30 text-[10px] font-black uppercase tracking-[0.2em] text-[#c9b299]/80">
            <tr>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">Creato</th>
              <th className="px-4 py-3 text-left">Salone</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Stato</th>
              <th className="px-4 py-3 text-left">Vendita</th>
              <th className="px-4 py-3 text-left">Sessione</th>
              <th className="px-4 py-3 text-right">Tentativi</th>
              <th className="px-4 py-3 text-left">Bloccato</th>
              <th className="px-4 py-3 text-left">Completato</th>
              <th className="px-4 py-3 text-left">Doc #</th>
              <th className="px-4 py-3 text-left">Z rep</th>
              <th className="px-4 py-3 text-left">Seriale</th>
              <th className="px-4 py-3 text-left">Errore</th>
              <th className="px-4 py-3 text-left">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#5c3a21]/30">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="text-[#e8dcc8] transition-colors hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3 tabular-nums font-semibold text-[#f3d8b6]">
                  {row.id}
                </td>
                <td className="px-4 py-3 text-[#c9b299] whitespace-nowrap">
                  {formatDateTime(row.created_at)}
                </td>
                <td className="px-4 py-3 text-[#c9b299]">#{row.salon_id}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-[#f3d8b6]/90">
                    {row.kind}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 tabular-nums text-[#c9b299]">
                  {row.sale_id ?? "—"}
                </td>
                <td className="px-4 py-3 tabular-nums text-[#c9b299]">
                  {row.cash_session_id ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[#c9b299]">
                  {row.attempts ?? "—"}
                </td>
                <td className="px-4 py-3 text-[#c9b299] whitespace-nowrap text-xs">
                  {formatDateTime(row.locked_at)}
                </td>
                <td className="px-4 py-3 text-[#c9b299] whitespace-nowrap text-xs">
                  {formatDateTime(row.completed_at)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#f3d8b6]">
                  {row.document?.fiscal_receipt_number ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#c9b299]">
                  {row.document?.z_rep_number ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#c9b299]">
                  {row.document?.printer_serial ?? "—"}
                </td>
                <td
                  className="px-4 py-3 max-w-[220px] truncate text-xs text-red-200/80"
                  title={row.error_message ?? undefined}
                >
                  {row.error_message ?? "—"}
                </td>
                <td className="px-4 py-3 align-top">
                  <FiscalJobRowActions
                    canAct={canAct}
                    job={{
                      id: row.id,
                      status: row.status,
                      kind: row.kind,
                      locked_at: row.locked_at,
                      created_at: row.created_at,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
