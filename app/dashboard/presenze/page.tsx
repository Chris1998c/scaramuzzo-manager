import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
  event_type: string;
  created_at: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT");
}

function getLiveStatusFromEvent(eventType: string | undefined): LiveStatus {
  return eventType === "clock_in" ? "inside" : "outside";
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
      .from("staff_attendance_logs")
      .select("staff_id,event_type,created_at")
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
        latestEventByStaffId.set(row.staff_id, row.event_type);
      }
    }
  }

  const totalRows = rows.length;
  const okCount = rows.filter((row) => !row.is_incomplete).length;
  const incompleteCount = rows.filter((row) => row.is_incomplete).length;
  const insideNowCount = rows.filter(
    (row) => getLiveStatusFromEvent(latestEventByStaffId.get(row.staff_id)) === "inside"
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-scz-dark via-[#141414] to-black/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">Presenze</h1>
            <p className="mt-1 text-sm text-white/60 md:text-base">
              Monitoraggio giornaliero collaboratori
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/85">
              Totale righe: <span className="text-white">{totalRows}</span>
            </span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
              OK: <span className="text-emerald-100">{okCount}</span>
            </span>
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
              Incomplete: <span className="text-amber-100">{incompleteCount}</span>
            </span>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">
              Dentro ora: <span className="text-cyan-100">{insideNowCount}</span>
            </span>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#161616] to-[#101010] shadow-[0_16px_50px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-white">
            <thead className="bg-black/45 text-xs uppercase tracking-[0.08em] text-white/75">
              <tr>
                <th className="px-5 py-3.5 text-left font-semibold">Giorno</th>
                <th className="px-5 py-3.5 text-left font-semibold">Collaboratore</th>
                <th className="px-5 py-3.5 text-left font-semibold">Salone</th>
                <th className="px-5 py-3.5 text-left font-semibold">Prima entrata</th>
                <th className="px-5 py-3.5 text-left font-semibold">Ultima uscita</th>
                <th className="px-5 py-3.5 text-right font-semibold">Minuti lavorati</th>
                <th className="px-5 py-3.5 text-right font-semibold">Ore lavorate</th>
                <th className="px-5 py-3.5 text-left font-semibold">Stato</th>
                <th className="px-5 py-3.5 text-left font-semibold">LIVE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => {
                const liveStatus = getLiveStatusFromEvent(latestEventByStaffId.get(row.staff_id));

                return (
                  <tr
                    key={`${row.staff_id}-${row.day}`}
                    className="transition-colors duration-150 hover:bg-white/[0.045]"
                  >
                    <td className="px-5 py-4 align-middle text-white/90">{row.day}</td>
                    <td className="px-5 py-4 align-middle text-white font-medium">{row.staff_name ?? "-"}</td>
                    <td className="px-5 py-4 align-middle text-white/85">#{row.salon_id}</td>
                    <td className="px-5 py-4 align-middle text-white/85">
                      {formatDateTime(row.first_clock_in_at)}
                    </td>
                    <td className="px-5 py-4 align-middle text-white/85">
                      {formatDateTime(row.last_clock_out_at)}
                    </td>
                    <td className="px-5 py-4 text-right align-middle tabular-nums text-white">
                      {row.worked_minutes}
                    </td>
                    <td className="px-5 py-4 text-right align-middle tabular-nums text-white">
                      {(row.worked_minutes / 60).toFixed(2)}
                    </td>
                    <td className="px-5 py-4 align-middle">
                      {row.is_incomplete ? (
                        <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
                          Incompleta
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 align-middle">
                      {liveStatus === "inside" && (
                        <span className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                          Dentro ora
                        </span>
                      )}
                      {liveStatus === "outside" && (
                        <span className="inline-flex rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-xs font-semibold text-white/80">
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
                    <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-black/25 px-4 py-6">
                      <p className="text-sm font-semibold text-white/85">
                        {hasError ? "Errore nel caricamento delle presenze." : "Nessuna presenza trovata."}
                      </p>
                      <p className="mt-1 text-xs text-white/55">
                        {hasError
                          ? "Riprova tra pochi secondi."
                          : "I riepiloghi giornalieri compariranno qui quando disponibili."}
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
