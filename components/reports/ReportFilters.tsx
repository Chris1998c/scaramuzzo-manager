"use client";

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { filenameFromContentDisposition } from "@/lib/reports/exportDownload";
import { reportExportPeriodError } from "@/lib/reports/reportDateRange";

type StaffOption = { id: number; name: string };

type Props = {
  salonId: number;
  salonLabel?: string | null;
  dateFrom: string;
  dateTo: string;
  staffId: number | null;
  paymentMethod: string | null;
  itemType: string | null;
  staffOptions: StaffOption[];
  macroTab: string;
  exportTab: string | null;
  periodSpanDays: number;
};

export default function ReportFilters({
  salonId,
  salonLabel,
  dateFrom,
  dateTo,
  staffId,
  paymentMethod,
  itemType,
  staffOptions,
  macroTab,
  exportTab,
  periodSpanDays,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function go(params: URLSearchParams, mode: "push" | "replace" = "push") {
    const url = `/dashboard/report?${params.toString()}`;
    startTransition(() => {
      if (mode === "replace") router.replace(url);
      else router.push(url);
      router.refresh(); // 🔥 forza server re-render con nuovi searchParams
    });
  }

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("salon_id", String(salonId));

    if (!value) params.delete(key);
    else params.set(key, value);

    go(params, "push");
  }

  // 🔥 quando cambia il salone globale: scrivi salon_id nuovo, reset staff_id, refresh server
  useEffect(() => {
    if (!salonId || salonId <= 0) return;

    const params = new URLSearchParams(searchParams.toString());
    const currentSalon = params.get("salon_id");

    if (currentSalon !== String(salonId)) {
      params.set("salon_id", String(salonId));
      params.delete("staff_id"); // reset filtro staff quando cambi salone
      go(params, "replace");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId]);

  function assertExportPeriodAllowed(): boolean {
    if (macroTab === "riepilogo") return true;
    const err = reportExportPeriodError(periodSpanDays);
    if (err) {
      toast.error(err);
      return false;
    }
    return true;
  }

  function exportPdf() {
    if (!assertExportPeriodAllowed()) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("salon_id", String(salonId));
    if (macroTab === "riepilogo") {
      params.set("tab", "direzione");
    } else if (!exportTab) {
      toast.error("Export PDF non disponibile per questa sezione.");
      return;
    } else {
      params.set("tab", exportTab);
    }
    void downloadExport("pdf", `/api/reports/export/pdf?${params.toString()}`);
  }

  function exportCsv() {
    if (!assertExportPeriodAllowed()) return;
    if (!exportTab) {
      toast.error("Export non disponibile per il Riepilogo. Usa Vendite o Team.");
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("salon_id", String(salonId));
    params.set("tab", exportTab);
    void downloadExport("csv", `/api/reports/export/csv?${params.toString()}`);
  }

  async function downloadExport(kind: "pdf" | "csv", url: string) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        let msg = `Errore export ${kind.toUpperCase()}`;
        try {
          const payload = await res.json();
          if (payload?.error) msg = String(payload.error);
        } catch {
          // noop
        }
        toast.error(msg);
        return;
      }

      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filenameFromContentDisposition(
        res.headers.get("Content-Disposition"),
        `report-export.${kind}`,
      );
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success(`Export ${kind.toUpperCase()} scaricato.`);
    } catch {
      toast.error(`Errore di rete durante export ${kind.toUpperCase()}`);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-scz-dark p-3.5 md:p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-[#f3d8b6]">Report</div>
          {salonId > 0 ? (
            <p className="mt-0.5 text-xs text-white/50 truncate">
              Sede:{" "}
              <span className="font-medium text-white/75">
                {salonLabel?.trim() || `ID ${salonId}`}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs font-medium text-amber-200/90">
              Nessun salone valido: seleziona una sede per caricare i report.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportPdf}
            className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm font-semibold text-[#f3d8b6]"
          >
            PDF
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm font-semibold text-[#f3d8b6]"
          >
            CSV
          </button>
        </div>
      </div>

      {macroTab === "riepilogo" ? (
        <p className="text-xs text-white/45">
          Il riepilogo usa oggi e mese corrente. Le date sotto valgono per Vendite, Team e Clienti.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
 <input
 type="date"
 value={dateFrom}
 onChange={(e) => updateParam("date_from", e.target.value)}
          className="min-w-0 px-3 py-2 rounded-xl bg-black/30 border border-white/10"
 />

 <input
 type="date"
 value={dateTo}
 onChange={(e) => updateParam("date_to", e.target.value)}
          className="min-w-0 px-3 py-2 rounded-xl bg-black/30 border border-white/10"
 />

 <select
 value={staffId ?? ""}
 onChange={(e) => updateParam("staff_id", e.target.value || null)}
          className="min-w-0 px-3 py-2 rounded-xl bg-black/30 border border-white/10"
 >
 <option value="">Tutti Staff</option>
 {staffOptions.map((s) => (
 <option key={s.id} value={String(s.id)}>
 {s.name}
 </option>
 ))}
 </select>

 <select
 value={paymentMethod ?? ""}
 onChange={(e) => updateParam("payment_method", e.target.value || null)}
          className="min-w-0 px-3 py-2 rounded-xl bg-black/30 border border-white/10"
 >
 <option value="">Pagamento</option>
 <option value="cash">Contanti</option>
 <option value="card">Carta</option>
 </select>

 <select
 value={itemType ?? ""}
 onChange={(e) => updateParam("item_type", e.target.value || null)}
          className="min-w-0 px-3 py-2 rounded-xl bg-black/30 border border-white/10"
 >
 <option value="">Tipo</option>
 <option value="service">Servizi</option>
 <option value="product">Prodotti</option>
        </select>
        </div>
      )}

      {isPending && <div className="text-xs text-white/40">Aggiornamento report...</div>}
    </div>
  );
}