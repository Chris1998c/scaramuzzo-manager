// components/reports/ReportWhatsAppRemindersTable.tsx

import type {
  WhatsAppReminderLogRow,
  WhatsAppReminderLogTotals,
} from "@/lib/reports/getWhatsAppReminderLog";
import { graphReminderStatusLabel } from "@/lib/whatsapp/appointmentReminderStatuses";
import { deliveryStatusLabel } from "@/lib/whatsapp/whatsappDeliveryStatus";

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

function graphStatusClass(s: string) {
  const v = s.toLowerCase().trim();
  if (v === "sent") return "text-emerald-300/95";
  if (v === "failed" || v === "error") return "text-rose-300/95";
  if (v === "skipped") return "text-amber-300/90";
  if (v === "pending" || v === "processing") return "text-sky-300/90";
  return "text-white/70";
}

function deliveryStatusClass(s: string | null) {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "delivered" || v === "read") return "text-emerald-300/95";
  if (v === "sent") return "text-sky-300/90";
  if (v === "failed") return "text-rose-300/95";
  return "text-white/45";
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
          Accettazione Graph e consegna Meta (webhook) · periodo dai filtri sopra
        </p>
      </div>

      <div className="bg-scz-dark border border-white/10 rounded-2xl p-6">
        <div className="grid md:grid-cols-4 gap-4">
          <div className={card}>
            <div className={label}>Accettati Graph</div>
            <div className="text-2xl font-extrabold text-white mt-1">{totals.sent}</div>
          </div>
          <div className={card}>
            <div className={label}>Errori Graph</div>
            <div className="text-2xl font-extrabold text-white mt-1">{totals.failed}</div>
          </div>
          <div className={card}>
            <div className={label}>Saltati</div>
            <div className="text-2xl font-extrabold text-white mt-1">{totals.skipped}</div>
          </div>
          <div className={card}>
            <div className={label}>In coda</div>
            <div className="text-2xl font-extrabold text-white mt-1">{totals.pending}</div>
          </div>
        </div>
        <div className="mt-4 grid md:grid-cols-3 gap-4">
          <div className={card}>
            <div className={label}>Consegnati</div>
            <div className="text-2xl font-extrabold text-white mt-1">{totals.delivered}</div>
          </div>
          <div className={card}>
            <div className={label}>Letti</div>
            <div className="text-2xl font-extrabold text-white mt-1">{totals.read}</div>
          </div>
          <div className={card}>
            <div className={label}>Consegna fallita</div>
            <div className="text-2xl font-extrabold text-white mt-1">
              {totals.delivery_failed}
            </div>
          </div>
        </div>
        <div className="mt-4 text-xs text-white/40">
          Graph = accettazione API. Consegna = stati webhook Meta (sent/delivered/read/failed).
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
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead>
              <tr className="bg-black/25">
                <th className={`${thBase} ${thPrimary}`}>Salone</th>
                <th className={`${thBase} ${thPrimary}`}>Cliente</th>
                <th className={`${thBase} ${thPrimary}`}>Appuntamento</th>
                <th className={`${thBase} ${thPrimary}`}>Graph</th>
                <th className={`${thBase} ${thPrimary}`}>Consegna</th>
                <th className={`${thBase} ${thPrimary}`}>Inviato il</th>
                <th className={`${thBase} ${thPrimary}`}>Errore</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className={`${tdBase} ${tdSecondary}`} colSpan={7}>
                    Nessun reminder nel periodo per questo salone.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const err =
                    r.delivery_error?.trim() ||
                    r.error_message?.trim() ||
                    "";
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.03]">
                      <td className={`${tdBase} ${tdPrimary}`}>{r.salon_name}</td>
                      <td className={`${tdBase} ${tdPrimary}`}>{r.customer_name}</td>
                      <td className={`${tdBase} ${tdSecondary}`}>
                        {formatRome(r.appointment_starts_at ?? r.scheduled_for)}
                      </td>
                      <td className={`${tdBase} font-bold ${graphStatusClass(r.status)}`}>
                        {graphReminderStatusLabel(r.status)}
                      </td>
                      <td
                        className={`${tdBase} font-bold ${deliveryStatusClass(r.delivery_status)}`}
                      >
                        {deliveryStatusLabel(r.delivery_status)}
                      </td>
                      <td className={`${tdBase} ${tdSecondary}`}>{formatRome(r.sent_at)}</td>
                      <td
                        className={`${tdBase} ${tdSecondary} max-w-[280px] truncate`}
                        title={err}
                      >
                        {err || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
