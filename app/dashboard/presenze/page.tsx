import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

type DailySummaryRow = {
  staff_id: number;
  staff_name: string | null;
  salon_id: number;
  day: string;
  first_clock_in_at: string | null;
  last_clock_out_at: string | null;
  worked_minutes: number;
  is_incomplete: boolean;
};

type DailySummaryResponse = {
  success: boolean;
  rows?: DailySummaryRow[];
};

type LiveStatus = "inside" | "outside";
type LatestAttendanceRow = {
  staff_id: number;
  type: string;
  created_at: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT");
}

function getLiveStatusFromType(attendanceType: string | undefined): LiveStatus {
  return attendanceType === "in" ? "inside" : "outside";
}

export default async function PresenzePage() {
  const access = await getUserAccess();
  if (access.role !== "coordinator" && access.role !== "reception") {
    redirect("/dashboard");
  }

  const h = await headers();
  const protocol = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");

  if (!host) {
    throw new Error("Unable to resolve host for attendance summary fetch.");
  }

  const cookie = h.get("cookie") ?? "";
  const response = await fetch(`${protocol}://${host}/api/attendance/daily-summary`, {
    method: "GET",
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  let rows: DailySummaryRow[] = [];
  let hasError = false;

  if (response.ok) {
    const payload = (await response.json()) as DailySummaryResponse;
    rows = payload.success ? payload.rows ?? [] : [];
    hasError = !payload.success;
  } else {
    hasError = true;
  }

  const uniqueStaffIds = Array.from(new Set(rows.map((row) => row.staff_id)));
  const latestEventByStaffId = new Map<number, string>();

  if (uniqueStaffIds.length > 0) {
    let liveQ = supabaseAdmin
      .from("attendance_logs")
      .select("staff_id,type,created_at")
      .in("staff_id", uniqueStaffIds)
      .order("created_at", { ascending: false });

    if (access.role === "reception") {
      const opSid = access.staffSalonId;
      if (opSid != null && opSid > 0) {
        liveQ = liveQ.eq("salon_id", opSid);
      }
    }

    const { data: latestEvents, error: latestEventsError } = await liveQ;

    if (latestEventsError) {
      throw latestEventsError;
    }

    for (const row of (latestEvents ?? []) as LatestAttendanceRow[]) {
      if (!latestEventByStaffId.has(row.staff_id)) {
        latestEventByStaffId.set(row.staff_id, row.type);
      }
    }
  }

  const totalRows = rows.length;
  const okCount = rows.filter((row) => !row.is_incomplete).length;
  const incompleteCount = rows.filter((row) => row.is_incomplete).length;
  const insideNowCount = rows.filter(
    (row) => getLiveStatusFromType(latestEventByStaffId.get(row.staff_id)) === "inside"
  ).length;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-4">
      {/* Hero — allineato a Magazzino / hub operativi */}
      <section className="rounded-3xl border border-white/10 bg-scz-dark shadow-[0_0_60px_rgba(0,0,0,0.25)] overflow-hidden">
        <div className="flex flex-col gap-5 p-5 md:p-7 bg-black/20 border-b border-white/10 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="shrink-0 rounded-2xl p-3 bg-black/30 border border-white/10">
              <ClipboardList className="text-[#f3d8b6]" size={28} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
                Modulo
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                Presenze
              </h1>
              <p className="text-[#c9b299] mt-1 text-sm md:text-base leading-relaxed">
                Monitoraggio giornaliero timbrature collaboratori (Team App)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <StatChip label="Righe" value={totalRows} variant="neutral" />
            <StatChip label="OK" value={okCount} variant="ok" />
            <StatChip label="Incomplete" value={incompleteCount} variant="warn" />
            <StatChip label="Dentro ora" value={insideNowCount} variant="live" />
          </div>
        </div>
      </section>

      {/* Tabella — card operativa Cassa / Impostazioni */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)]">
        <div className="border-b border-white/10 bg-black/20 px-5 py-3.5">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            Riepilogo giornaliero
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-black/30 text-[10px] font-black uppercase tracking-[0.2em] text-[#c9b299]/80">
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
                const liveStatus = getLiveStatusFromType(latestEventByStaffId.get(row.staff_id));

                return (
                  <tr
                    key={`${row.staff_id}-${row.day}`}
                    className="text-[#e8dcc8] transition-colors duration-150 hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4 align-middle text-[#c9b299] tabular-nums">{row.day}</td>
                    <td className="px-5 py-4 align-middle font-semibold text-[#f3d8b6]">
                      {row.staff_name ?? "-"}
                    </td>
                    <td className="px-5 py-4 align-middle text-[#c9b299]">#{row.salon_id}</td>
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
                      {(row.worked_minutes / 60).toFixed(2)}
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
                          : "I riepiloghi compariranno qui dopo le timbrature dalla Team App."}
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
    neutral:
      "border-[#5c3a21]/50 bg-black/25 text-[#c9b299]",
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
