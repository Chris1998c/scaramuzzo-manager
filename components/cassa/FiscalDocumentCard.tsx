"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import type { FiscalDocumentBySaleResponse } from "@/lib/fiscal/fiscalDocumentTypes";

type Props = {
  saleId: number;
  className?: string;
};

const FISCAL_STATUS_META: Record<
  string,
  { label: string; badge: string }
> = {
  pending: {
    label: "In attesa",
    badge: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  },
  queued: {
    label: "In coda stampa",
    badge: "bg-sky-500/15 text-sky-200 border-sky-500/30",
  },
  printed: {
    label: "Stampato",
    badge: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  },
  error: {
    label: "Errore stampa",
    badge: "bg-red-500/15 text-red-200 border-red-500/30",
  },
  not_required: {
    label: "Stampa non richiesta",
    badge: "bg-white/10 text-white/60 border-white/15",
  },
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  sale_receipt: "Scontrino vendita",
  void_receipt: "Scontrino annullo",
  return_receipt: "Scontrino reso",
  z_report: "Report Z",
};

const JOB_STATUS_META: Record<string, { label: string; badge: string }> = {
  pending: {
    label: "In attesa",
    badge: "bg-white/10 text-white/55 border-white/15",
  },
  processing: {
    label: "In elaborazione",
    badge: "bg-sky-500/15 text-sky-200 border-sky-500/30",
  },
  completed: {
    label: "Completato",
    badge: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  },
  failed: {
    label: "Fallito",
    badge: "bg-red-500/15 text-red-200 border-red-500/30",
  },
  cancelled: {
    label: "Annullato",
    badge: "bg-white/10 text-white/50 border-white/15",
  },
};

function metaFor(
  map: Record<string, { label: string; badge: string }>,
  key: string | null | undefined,
  fallback: string,
) {
  const k = String(key ?? "").toLowerCase().trim();
  return map[k] ?? { label: fallback, badge: "bg-white/10 text-white/55 border-white/15" };
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  const display =
    value != null && String(value).trim() !== "" ? String(value) : "—";
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] font-black uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div
        className={`mt-1.5 text-sm font-semibold text-white/90 break-all ${
          mono ? "font-mono text-[#f3d8b6]/95" : ""
        }`}
      >
        {display}
      </div>
    </div>
  );
}

export default function FiscalDocumentCard({ saleId, className = "" }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fiscalStatus, setFiscalStatus] = useState<string | null>(null);
  const [saleStatus, setSaleStatus] = useState<string | null>(null);
  const [canVoidFiscal, setCanVoidFiscal] = useState(false);
  const [voidBlockedReason, setVoidBlockedReason] = useState<string | null>(null);
  const [document, setDocument] =
    useState<FiscalDocumentBySaleResponse["document"]>(null);

  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!Number.isFinite(saleId) || saleId <= 0) return;
      if (opts?.silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/cassa/fiscal-document?sale_id=${encodeURIComponent(String(saleId))}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as FiscalDocumentBySaleResponse & {
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Errore caricamento documento fiscale");
        }
        setFiscalStatus(data.fiscal_status ?? null);
        setSaleStatus(data.sale_status ?? null);
        setCanVoidFiscal(!!data.can_void_fiscal);
        setVoidBlockedReason(data.void_blocked_reason ?? null);
        setDocument(data.document ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore di rete");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [saleId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!voidModalOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !voidSubmitting) setVoidModalOpen(false);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [voidModalOpen, voidSubmitting]);

  async function submitVoidFiscal() {
    const reason = voidReason.trim();
    if (!reason) {
      toast.error("Inserisci il motivo dell’annullo");
      return;
    }

    setVoidSubmitting(true);
    try {
      const res = await fetch("/api/cassa/void-fiscal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: saleId, reason }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        job_id?: number;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Errore annullo fiscale");
      }

      setVoidModalOpen(false);
      setVoidReason("");
      toast.success("Annullo fiscale accodato");
      await load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore annullo fiscale");
    } finally {
      setVoidSubmitting(false);
    }
  }

  const fiscalMeta = metaFor(
    FISCAL_STATUS_META,
    fiscalStatus,
    fiscalStatus ?? "—",
  );
  const jobMeta = metaFor(
    JOB_STATUS_META,
    document?.job_status,
    document?.job_status ?? "—",
  );
  const docTypeLabel =
    DOCUMENT_TYPE_LABELS[String(document?.document_type ?? "").toLowerCase()] ??
    document?.document_type ??
    "—";

  const receiptWhen =
    document?.receipt_iso_datetime ??
    (document?.fiscal_receipt_date && document?.fiscal_receipt_time
      ? `${document.fiscal_receipt_date} ${document.fiscal_receipt_time}`
      : document?.fiscal_receipt_date);

  const voidButtonDisabled =
    loading || refreshing || voidSubmitting || !canVoidFiscal;

  return (
    <>
      <div
        className={`overflow-hidden rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)] ${className}`}
      >
        <div className="border-b border-white/10 bg-black/20 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#f3d8b6]/25 bg-[#f3d8b6]/10 text-[#f3d8b6]">
              <FileText className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                Documento fiscale
              </div>
              <div className="mt-0.5 text-sm text-white/50 truncate">
                Vendita #{saleId}
                {saleStatus && saleStatus !== "posted" ? (
                  <span className="text-white/35"> · {saleStatus}</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${fiscalMeta.badge}`}
            >
              {fiscalMeta.label}
            </span>
            <button
              type="button"
              onClick={() => void load({ silent: true })}
              disabled={loading || refreshing}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 text-white/50 hover:text-[#f3d8b6] hover:border-[#f3d8b6]/30 hover:bg-black/30 transition-colors disabled:opacity-40"
              title="Aggiorna dati fiscali"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                aria-hidden
              />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-7 space-y-5">
          {loading && (
            <p className="text-sm text-white/45 animate-pulse font-medium">
              Caricamento coordinate fiscali…
            </p>
          )}

          {!loading && error && (
            <p className="text-sm text-red-300/90 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {!loading && !error && !document && (
            <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-5 py-6 text-center">
              <p className="text-sm font-medium text-white/55">
                Documento fiscale non ancora disponibile
              </p>
              <p className="mt-2 text-xs text-white/35 max-w-md mx-auto">
                Le coordinate appariranno dopo la stampa Epson e la finalizzazione
                del job fiscale.
              </p>
            </div>
          )}

          {!loading && !error && document && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Tipo documento" value={docTypeLabel} />
                <Field
                  label="N. scontrino fiscale"
                  value={document.fiscal_receipt_number}
                  mono
                />
                <Field label="Z rep." value={document.z_rep_number} mono />
                <Field label="Matricola stampante" value={document.printer_serial} mono />
                <Field label="Data/ora ricevuta" value={receiptWhen} />
                <Field
                  label="Job fiscale"
                  value={
                    document.fiscal_print_job_id
                      ? `#${document.fiscal_print_job_id}`
                      : null
                  }
                  mono
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-white/35">
                  Stato job
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${jobMeta.badge}`}
                >
                  {jobMeta.label}
                </span>
                {document.fiscal_receipt_amount != null && (
                  <span className="text-xs text-white/45 ml-auto">
                    Importo fiscale € {document.fiscal_receipt_amount.toFixed(2)}
                  </span>
                )}
              </div>
            </>
          )}

          <div className="pt-1 border-t border-white/10 space-y-2">
            <button
              type="button"
              disabled={voidButtonDisabled}
              onClick={() => setVoidModalOpen(true)}
              className={`w-full sm:w-auto min-h-[44px] px-5 rounded-xl font-black uppercase tracking-[0.14em] text-[10px] border transition-colors ${
                voidButtonDisabled
                  ? "border-white/10 bg-black/25 text-white/35 cursor-not-allowed"
                  : "border-red-500/35 bg-red-500/15 text-red-200 hover:bg-red-500/25"
              }`}
              title={voidBlockedReason ?? undefined}
            >
              Annulla fiscalmente
            </button>
            {!loading && voidBlockedReason && (
              <p className="text-xs text-white/40 max-w-xl">{voidBlockedReason}</p>
            )}
          </div>
        </div>
      </div>

      {voidModalOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
          onClick={() => {
            if (!voidSubmitting) setVoidModalOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="void-fiscal-dialog-title"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)] overflow-hidden text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-white/10 bg-black/20">
              <h2
                id="void-fiscal-dialog-title"
                className="text-lg font-bold text-[#f3d8b6]"
              >
                Annulla fiscalmente
              </h2>
              <p className="mt-1.5 text-sm text-white/70">
                Vendita #{saleId} · scontrino #{document?.fiscal_receipt_number ?? "—"}.
                L’annullo verrà accodato per la stampante Epson.
              </p>
              <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-white/50">
                Motivo (obbligatorio)
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={4}
                disabled={voidSubmitting}
                placeholder="Es. errore importo, cliente errato…"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#f3d8b6]/40 focus:ring-1 focus:ring-[#f3d8b6]/30 resize-y min-h-[96px] disabled:opacity-50"
              />
            </div>
            <div className="px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                disabled={voidSubmitting}
                onClick={() => setVoidModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-white/10 bg-black/30 text-white/90 font-medium hover:bg-black/40 transition disabled:opacity-50"
              >
                Chiudi
              </button>
              <button
                type="button"
                disabled={voidSubmitting || !voidReason.trim()}
                onClick={() => void submitVoidFiscal()}
                className="px-4 py-2.5 rounded-xl bg-red-500/90 text-white font-bold hover:bg-red-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {voidSubmitting ? "Invio…" : "Conferma annullo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
