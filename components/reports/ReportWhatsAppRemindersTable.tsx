// components/reports/ReportWhatsAppRemindersTable.tsx

import type {
  WhatsAppReminderLogRow,
  WhatsAppReminderLogTotals,
} from "@/lib/reports/getWhatsAppReminderLog";

const thBase =
  "px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b border-white/10";
const thPrimary = "text-white/90";
const tdBase = "px-4 py-3 border-b border-white/5";
const tdPrimary = "text-white font-medium";
const tdSecondary = "text-white/60";

function formatRome(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(d);
}

function statusLabel(s: string) {
  const v = s.toLowerCase().trim();
  if (v === "sent") return "Inviato";
  if (v === "error") return "Errore";
  if (v === "processing") return "In elaborazione";
  if (v === "pending") return "In attesa";
  return s || "—";
}

function statusClass(s: string) {
  const v = s.toLowerCase().trim();
  if (v === "sent") return "text-emerald-300/95";
  if (v === "error") return "text-rose-300/95";
  if (v === "processing") return "text-amber-300/90";
  return "text-white/70";
}

export default function ReportWhatsAppRemindersTable({
  rows,
  totals,
}: {
  rows: WhatsAppReminderLogRow[];
  totals: WhatsAppReminderLogTotals;
}) {
  const card = "p-4 rounded-2xl bg-black/20 border border-white/10";
  const label = "text-[10px] font-black tracking-[0.25em] uppercase text-white/35";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-white md:text-2xl">
          Storico reminder WhatsApp
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Appuntamenti · invii automatici · periodo dai filtri sopra
        </p>
      </div>

      <div className="bg-scz-dark border border-white/10 rounded-2xl p-6">
        <div className="grid md:grid-cols-3 gap-4">
          <div className={card}>
            <div className={label}>Inviati</div>
            <div className="text-2xl font-extrabold text-white mt-1">{totals.sent}</div>
          </div>
          <div className={card}>
            <div className={label}>Errori</div>
            <div className="text-2xl font-extrabold text-white mt-1">{totals.error}</div>
          </div>
          <div className={card}>
            <div className={label}>In elaborazione</div>
            <div className="text-2xl font-extrabold text-white mt-1">{totals.processing}</div>
          </div>
        </div>
        <div className="mt-4 text-xs text-white/40">
          Conteggi sul periodo selezionato (stesso filtro data degli altri report).
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
        <div className="border-b border-white/10 bg-black/20 px-6 py-5">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            Dettaglio invii
          </div>
          <div className="mt-1 text-sm text-white/50">
            Fino a 400 righe · ordine per data creazione record (più recenti prima)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead>
              <tr className="bg-black/25">
                <th className={`${thBase} ${thPrimary}`}>Salone</th>
                <th className={`${thBase} ${thPrimary}`}>Cliente</th>
                <th className={`${thBase} ${thPrimary}`}>Appuntamento</th>
                <th className={`${thBase} ${thPrimary}`}>Stato</th>
                <th className={`${thBase} ${thPrimary}`}>Inviato il</th>
                <th className={`${thBase} ${thPrimary}`}>Errore</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className={`${tdBase} ${tdSecondary}`} colSpan={6}>
                    Nessun reminder nel periodo per questo salone.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.03]">
                    <td className={`${tdBase} ${tdPrimary}`}>{r.salon_name}</td>
                    <td className={`${tdBase} ${tdPrimary}`}>{r.customer_name}</td>
                    <td className={`${tdBase} ${tdSecondary}`}>
                      {formatRome(r.appointment_starts_at ?? r.scheduled_for)}
                    </td>
                    <td className={`${tdBase} font-bold ${statusClass(r.status)}`}>
                      {statusLabel(r.status)}
                    </td>
                    <td className={`${tdBase} ${tdSecondary}`}>{formatRome(r.sent_at)}</td>
                    <td
                      className={`${tdBase} ${tdSecondary} max-w-[280px] truncate`}
                      title={r.error_message ?? ""}
                    >
                      {r.error_message ? r.error_message : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
