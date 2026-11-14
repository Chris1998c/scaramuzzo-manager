"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { filenameFromContentDisposition } from "@/lib/reports/exportDownload";
import { reportExportPeriodError } from "@/lib/reports/reportDateRange";
import { salonLabel } from "@/lib/constants";

type StaffOption = { id: number; name: string };

type Props = {
  salonId: number | null;
  canChooseSalon: boolean;
  allowedSalonIds: number[];
  dateFrom: string;
  dateTo: string;
  staffId: number | null;
  staffOptions: StaffOption[];
  periodSpanDays: number;
};

export default function PresenzeFilters({
  salonId,
  canChooseSalon,
  allowedSalonIds,
  dateFrom,
  dateTo,
  staffId,
  staffOptions,
  periodSpanDays,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function go(params: URLSearchParams) {
    startTransition(() => {
      router.push(`/dashboard/presenze?${params.toString()}`);
      router.refresh();
    });
  }

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (salonId != null) params.set("salon_id", String(salonId));
    else if (canChooseSalon) params.set("salon_id", "all");

    if (!value) params.delete(key);
    else params.set(key, value);
    go(params);
  }

  function onSalonChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("salon_id", value);
    params.delete("staff_id");
    go(params);
  }

  async function downloadExport(kind: "pdf" | "csv") {
    const err = reportExportPeriodError(periodSpanDays);
    if (err) {
      toast.error(err);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (salonId != null) params.set("salon_id", String(salonId));
    else if (canChooseSalon) params.set("salon_id", "all");
    params.set("date_from", dateFrom);
    params.set("date_to", dateTo);
    if (staffId) params.set("staff_id", String(staffId));
    else params.delete("staff_id");

    const url = `/api/attendance/export/${kind}?${params.toString()}`;
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        let msg = `Errore export ${kind.toUpperCase()}`;
        try {
          const payload = await res.json();
          if (payload?.error) msg = String(payload.error);
        } catch {
          /* noop */
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
        `presenze-export.${kind}`,
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
          <div className="text-sm font-semibold text-[#f3d8b6]">Filtri e export</div>
          <p className="mt-0.5 text-xs text-white/50 truncate">
            Sede:{" "}
            <span className="font-medium text-white/75">
              {salonId != null ? salonLabel(salonId) : "Tutti i saloni"}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void downloadExport("pdf")}
            className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm font-semibold text-[#f3d8b6]"
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => void downloadExport("csv")}
            className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm font-semibold text-[#f3d8b6]"
          >
            CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {canChooseSalon ? (
          <select
            value={salonId != null ? String(salonId) : "all"}
            onChange={(e) => onSalonChange(e.target.value)}
            className="min-w-0 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-[#e8dcc8]"
          >
            <option value="all">Tutti i saloni</option>
            {allowedSalonIds.map((id) => (
              <option key={id} value={String(id)}>
                {salonLabel(id)}
              </option>
            ))}
          </select>
        ) : (
          <div className="min-w-0 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-[#c9b299] text-sm">
            {salonId != null ? salonLabel(salonId) : "Salone operativo"}
          </div>
        )}

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => updateParam("date_from", e.target.value)}
          className="min-w-0 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-[#e8dcc8]"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => updateParam("date_to", e.target.value)}
          className="min-w-0 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-[#e8dcc8]"
        />
        <select
          value={staffId ?? ""}
          onChange={(e) => updateParam("staff_id", e.target.value || null)}
          className="min-w-0 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-[#e8dcc8]"
        >
          <option value="">Tutti i collaboratori</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {isPending && (
        <div className="text-xs text-white/40">Aggiornamento presenze...</div>
      )}
    </div>
  );
}
