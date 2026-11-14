import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getUserAccess } from "@/lib/getUserAccess";
import { salonLabel } from "@/lib/constants";
import { formatRomeDateTime } from "@/lib/datetime/formatRomeInstant";
import {
  countStaffLiveInside,
  hoursFromMinutes,
  liveStatusForRow,
  todayRomeBusinessDate,
} from "@/lib/attendance/attendanceDailySummary";
import { loadAttendanceDailySummary } from "@/lib/attendance/loadAttendanceDailySummary";
import { resolveAttendanceQuery } from "@/lib/attendance/resolveAttendanceQuery";
import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PresenzeSalonSync from "./PresenzeSalonSync";
import PresenzeFilters from "./PresenzeFilters";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(sp: SearchParams, key: string): string | undefined {
  const raw = sp[key];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const formatted = formatRomeDateTime(value);
  return formatted === "—" ? "-" : formatted;
}

export default async function PresenzePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const access = await getUserAccess();
  if (access.role !== "coordinator" && access.role !== "reception") {
    redirect("/dashboard");
  }

  const sp = (await Promise.resolve(searchParams ?? {})) as SearchParams;
  const todayRome = todayRomeBusinessDate();
  const resolved = resolveAttendanceQuery({
    access,
    salonIdRaw: firstParam(sp, "salon_id"),
    staffIdRaw: firstParam(sp, "staff_id"),
    dateFromRaw: firstParam(sp, "date_from"),
    dateToRaw: firstParam(sp, "date_to"),
    todayRome,
  });

  // URL canonico: salon/date (refresh diretto e switch header)
  const needsSalon =
    resolved.canChooseSalon &&
    !firstParam(sp, "salon_id") &&
    resolved.salonId != null;
  const needsDates =
    !firstParam(sp, "date_from") ||
    !firstParam(sp, "date_to") ||
    resolved.dateRange.needsRedirect;

  if (needsSalon || needsDates) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const first = Array.isArray(v) ? v[0] : v;
      if (first) p.set(k, String(first));
    }
    if (resolved.salonId != null) p.set("salon_id", String(resolved.salonId));
    else if (resolved.canChooseSalon) p.set("salon_id", "all");
    p.set("date_from", resolved.dateRange.dateFrom);
    p.set("date_to", resolved.dateRange.dateTo);
    redirect(`/dashboard/presenze?${p.toString()}`);
  }

  let rows = [] as Awaited<ReturnType<typeof loadAttendanceDailySummary>>;
  let hasError = false;
  try {
    if (resolved.querySalonIds !== null && resolved.querySalonIds.length === 0) {
      rows = [];
    } else {
      rows = await loadAttendanceDailySummary({
        querySalonIds: resolved.querySalonIds,
        salonId: resolved.salonId,
        staffId: resolved.staffId,
        dateFrom: resolved.dateRange.dateFrom,
        dateTo: resolved.dateRange.dateTo,
      });
    }
  } catch (e) {
    console.error("presenze page load:", e);
    hasError = true;
  }

  let staffOptions: { id: number; name: string }[] = [];
  if (resolved.salonId != null) {
    try {
      const staffRows = await fetchActiveStaffForSalon(
        supabaseAdmin,
        resolved.salonId,
        "id,name",
      );
      staffOptions = staffRows
        .map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? "").trim() || `Staff #${r.id}`,
        }))
        .filter((s) => Number.isInteger(s.id) && s.id > 0);
    } catch (e) {
      console.error("presenze staff options:", e);
    }
  } else {
    const ids = Array.from(new Set(rows.map((r) => r.staff_id)));
    if (ids.length) {
      const { data } = await supabaseAdmin
        .from("staff")
        .select("id,name")
        .in("id", ids)
        .order("name", { ascending: true });
      staffOptions = (data ?? []).map((r) => ({
        id: Number((r as { id: number }).id),
        name: String((r as { name: string | null }).name ?? "").trim() || `Staff`,
      }));
    }
  }

  const okCount = rows.filter((row) => !row.is_incomplete).length;
  const incompleteCount = rows.filter((row) => row.is_incomplete).length;
  const insideNowCount = countStaffLiveInside(rows);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-4">
      <Suspense fallback={null}>
        <PresenzeSalonSync canChooseSalon={resolved.canChooseSalon} />
      </Suspense>

      <section className="rounded-3xl border border-white/10 bg-scz-dark overflow-hidden">
        <div className="flex flex-col gap-5 p-5 md:p-7 bg-black/20 border-b border-white/10 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="shrink-0 rounded-2xl p-3 bg-black/30 border border-white/10">
              <ClipboardList className="text-[#f3d8b6]" size={28} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                Presenze
              </h1>
              <p className="text-[#c9b299] mt-1 text-sm md:text-base leading-relaxed">
                Timbrature Team App · giorno operativo Europe/Rome
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <StatChip label="Righe" value={rows.length} variant="neutral" />
            <StatChip label="OK" value={okCount} variant="ok" />
            <StatChip label="Incomplete" value={incompleteCount} variant="warn" />
            <StatChip label="Dentro ora" value={insideNowCount} variant="live" />
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <PresenzeFilters
          salonId={resolved.salonId}
          canChooseSalon={resolved.canChooseSalon}
          allowedSalonIds={resolved.allowedSalonIds}
          dateFrom={resolved.dateRange.dateFrom}
          dateTo={resolved.dateRange.dateTo}
          staffId={resolved.staffId}
          staffOptions={staffOptions}
          periodSpanDays={resolved.dateRange.spanDays}
        />
      </Suspense>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
        <div className="border-b border-white/10 bg-black/20 px-5 py-3.5">
          <div className="text-xs font-medium text-white/40">
            Riepilogo {resolved.dateRange.dateFrom} → {resolved.dateRange.dateTo}
            {resolved.salonId != null ? ` · ${salonLabel(resolved.salonId)}` : " · Tutti i saloni"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-black/30 text-xs font-medium text-[#c9b299]/80">
              <tr>
                <th className="px-5 py-3.5 text-left">Giorno</th>
                <th className="px-5 py-3.5 text-left">Collaboratore</th>
                <th className="px-5 py-3.5 text-left">Salone</th>
                <th className="px-5 py-3.5 text-left">Prima entrata</th>
                <th className="px-5 py-3.5 text-left">Ultima uscita</th>
                <th className="px-5 py-3.5 text-right">Minuti</th>
                <th className="px-5 py-3.5 text-right">Ore</th>
                <th className="px-5 py-3.5 text-left">Stato</th>
                <th className="px-5 py-3.5 text-left">Live</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#5c3a21]/30">
              {rows.map((row) => {
                const liveStatus = liveStatusForRow(row);
                return (
                  <tr
                    key={`${row.staff_id}-${row.salon_id}-${row.day}`}
                    className="text-[#e8dcc8] transition-colors duration-150 hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4 align-middle text-[#c9b299] tabular-nums">
                      {row.day}
                    </td>
                    <td className="px-5 py-4 align-middle font-semibold text-[#f3d8b6]">
                      {row.staff_name ?? "-"}
                    </td>
                    <td className="px-5 py-4 align-middle text-[#c9b299]">
                      {salonLabel(row.salon_id)}
                    </td>
                    <td className="px-5 py-4 align-middle text-[#c9b299]">
                      {formatDateTime(row.first_clock_in_at)}
                    </td>
                    <td className="px-5 py-4 align-middle text-[#c9b299]">
                      {formatDateTime(row.last_clock_out_at)}
                    </td>
                    <td className="px-5 py-4 text-right align-middle tabular-nums text-[#f3d8b6]">
                      {row.worked_minutes}
                    </td>
                    <td className="px-5 py-4 text-right align-middle tabular-nums text-[#c9b299]">
                      {hoursFromMinutes(row.worked_minutes)}
                    </td>
                    <td className="px-5 py-4 align-middle">
                      {row.is_incomplete ? (
                        <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-200/95">
                          Incompleta
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-200/95">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 align-middle">
                      {liveStatus === "inside" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f3d8b6]/35 bg-[#f3d8b6]/10 px-2.5 py-1 text-[11px] font-bold text-[#f3d8b6] shadow-[0_0_12px_rgba(243,216,182,0.12)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                          Dentro ora
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-bold text-[#c9b299]/90">
                          Fuori ora
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td className="px-5 py-12 text-center" colSpan={9}>
                    <div
                      className={`mx-auto max-w-md rounded-2xl border px-5 py-6 ${
                        hasError
                          ? "border-amber-500/30 bg-amber-500/10"
                          : "border-[#5c3a21]/40 bg-black/20"
                      }`}
                    >
                      <p
                        className={`text-sm font-bold ${
                          hasError ? "text-amber-100" : "text-[#f3d8b6]"
                        }`}
                      >
                        {hasError
                          ? "Errore nel caricamento delle presenze"
                          : "Nessuna presenza trovata"}
                      </p>
                      <p className="mt-1.5 text-xs text-[#c9b299] leading-relaxed">
                        {hasError
                          ? "Riprova tra pochi secondi. Se il problema persiste, verifica la connessione."
                          : "Prova un altro salone o amplia il periodo."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatChip({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "neutral" | "ok" | "warn" | "live";
}) {
  const styles = {
    neutral: "border-[#5c3a21]/50 bg-black/25 text-[#c9b299]",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/95",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-200/95",
    live: "border-[#f3d8b6]/30 bg-[#f3d8b6]/10 text-[#f3d8b6]",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${styles[variant]}`}
    >
      <span className="opacity-80">{label}:</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}
