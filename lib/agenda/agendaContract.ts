import type { SupabaseClient } from "@supabase/supabase-js";
import { SLOT_MINUTES } from "@/components/agenda/utils";

export const AGENDA_LIST_SELECT = `
  id,
  start_time,
  end_time,
  status,
  notes,
  staff_id,
  customer_id,
  customer:customer_id (
    first_name,
    last_name
  ),
  appointment_services (
    id,
    appointment_id,
    service_id,
    start_time,
    duration_minutes,
    staff_id,
    services:service_id (
      id,
      name,
      duration,
      color_code
    )
  )
`;

export type AgendaCustomer = { first_name: string; last_name: string };

export type AgendaServiceEmbed = {
  id: number;
  name: string;
  duration: number;
  color_code: string;
};

export type AgendaServiceLine = {
  id: number;
  appointment_id: number;
  service_id: number;
  start_time: string;
  duration_minutes: number;
  staff_id: number | null;
  services: AgendaServiceEmbed;
};

export type AgendaAppointment = {
  id: number;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  staff_id: number | null;
  customer_id: string | number | null;
  customers: AgendaCustomer;
  appointment_services: AgendaServiceLine[];
};

export function normalizeStaffId(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseLocal(ts: string): Date {
  const [date, time] = String(ts).split("T");
  const [y, m, d] = String(date || "").split("-").map(Number);
  const [hh, mm, ss] = String(time || "00:00:00").split(":").map(Number);
  return new Date(y || 0, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0, 0);
}

export function toNoZ(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

/** Durata riga / header: minimo SLOT_MINUTES, mai NaN. */
export function clampDurationMinutes(minutes: unknown): number {
  const n = Number(minutes);
  return Number.isFinite(n) && n >= SLOT_MINUTES ? Math.round(n) : SLOT_MINUTES;
}

function safeDuration(minutes: unknown): number {
  return clampDurationMinutes(minutes);
}

/** PostgREST può restituire embed many-to-one come oggetto; in casi anomali come array. */
function unwrapSingleEmbed<T extends Record<string, unknown>>(v: unknown): T | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const head = v[0];
    return head != null && typeof head === "object" ? (head as T) : undefined;
  }
  if (typeof v === "object") return v as T;
  return undefined;
}

export function lineLogicalEndMs(startTime: string, durationMinutes: number): number {
  return parseLocal(startTime).getTime() + durationMinutes * 60_000;
}

type HeaderLineInput = {
  id?: number;
  start_time: string;
  duration_minutes: number;
  staff_id: number | null;
};

export function computeHeaderFromLines(lines: HeaderLineInput[]): {
  start_time: string;
  end_time: string;
  staff_id: number | null;
} {
  if (!lines.length) {
    throw new Error("computeHeaderFromLines: no lines");
  }
  const normalized = lines.map((ln) => ({
    ...ln,
    duration_minutes: clampDurationMinutes(ln.duration_minutes),
  }));
  const sorted = [...normalized].sort((a, b) => {
    const dt = parseLocal(a.start_time).getTime() - parseLocal(b.start_time).getTime();
    if (dt !== 0) return dt;
    return Number(a.id ?? 0) - Number(b.id ?? 0);
  });
  const first = sorted[0];
  let minStartMs = parseLocal(first.start_time).getTime();
  let maxEndMs = lineLogicalEndMs(first.start_time, first.duration_minutes);
  for (const ln of sorted) {
    const sm = parseLocal(ln.start_time).getTime();
    if (sm < minStartMs) minStartMs = sm;
    const em = lineLogicalEndMs(ln.start_time, ln.duration_minutes);
    if (em > maxEndMs) maxEndMs = em;
  }
  return {
    start_time: toNoZ(new Date(minStartMs)),
    end_time: toNoZ(new Date(maxEndMs)),
    staff_id: normalizeStaffId(first.staff_id),
  };
}

export function normalizeAgendaRows(raw: unknown[] | null): AgendaAppointment[] {
  if (!raw?.length) return [];
  const mapped = (raw as Record<string, unknown>[]).map((row) => {
    const c = unwrapSingleEmbed<Record<string, unknown>>(row?.customer);
    const linesRaw = Array.isArray(row?.appointment_services)
      ? (row.appointment_services as Record<string, unknown>[])
      : [];
    const lines = linesRaw.filter((ln) => {
      const nid = Number(ln.id);
      return ln.id != null && Number.isFinite(nid) && nid > 0;
    });
    const aid = Number(row.id);
    return {
      id: aid,
      start_time: String(row.start_time ?? ""),
      end_time: String(row.end_time ?? ""),
      status: String(row.status ?? "scheduled"),
      notes: row.notes == null || row.notes === "" ? null : String(row.notes),
      staff_id: normalizeStaffId(row.staff_id),
      customer_id: (row.customer_id as string | number | null) ?? null,
      customers: {
        first_name: String(c?.first_name ?? ""),
        last_name: String(c?.last_name ?? ""),
      },
      appointment_services: lines.map((ln) => {
        const dur = safeDuration(ln.duration_minutes);
        const svc = unwrapSingleEmbed<Record<string, unknown>>(ln.services);
        const sid = Number(ln.service_id);
        return {
          id: Number(ln.id),
          appointment_id: Number(ln.appointment_id ?? aid),
          service_id: Number.isFinite(sid) ? sid : 0,
          start_time: String(ln.start_time ?? ""),
          duration_minutes: dur,
          staff_id: normalizeStaffId(ln.staff_id),
          services: {
            id: Number(svc?.id ?? sid ?? 0),
            name: String(svc?.name ?? "Servizio"),
            duration: Number.isFinite(Number(svc?.duration)) ? Number(svc?.duration) : dur,
            color_code:
              String(svc?.color_code ?? "#a8754f").trim() || "#a8754f",
          },
        };
      }),
    };
  });
  return mapped.filter(
    (app): app is AgendaAppointment => Number.isFinite(app.id) && app.id > 0
  );
}

export async function syncAppointmentHeaderFromDb(
  client: SupabaseClient,
  appointmentId: number
): Promise<{ ok: true } | { ok: false; error: Error }> {
  const { data: lines, error } = await client
    .from("appointment_services")
    .select("id, start_time, duration_minutes, staff_id")
    .eq("appointment_id", appointmentId)
    .order("start_time", { ascending: true })
    .order("id", { ascending: true });

  if (error) return { ok: false, error: new Error(error.message) };
  if (!lines?.length) return { ok: true };

  const header = computeHeaderFromLines(lines as HeaderLineInput[]);
  const { data: updatedHeader, error: u2 } = await client
    .from("appointments")
    .update({
      start_time: header.start_time,
      end_time: header.end_time,
      staff_id: header.staff_id,
    })
    .eq("id", appointmentId)
    .select("id");
  if (u2) return { ok: false, error: new Error(u2.message) };
  if (!updatedHeader?.length) {
    return {
      ok: false,
      error: new Error(
        "syncAppointmentHeaderFromDb: nessuna riga appointments aggiornata (id o RLS)."
      ),
    };
  }
  return { ok: true };
}

export type LinePatch = Partial<{
  start_time: string;
  duration_minutes: number;
  staff_id: number | null;
}>;

/**
 * Aggiorna una riga appointment_services e ricalcola l'header appointments.
 * Patch vuota: no-op (nessuna query); l'header non viene toccato.
 */
export async function commitLinePatch(
  client: SupabaseClient,
  args: {
    appointmentId: number;
    lineId: number | string;
    patch: LinePatch;
  }
): Promise<{ ok: true } | { ok: false; error: Error }> {
  const idNum = Number(args.lineId);
  if (
    args.lineId === "" ||
    args.lineId === null ||
    !Number.isFinite(idNum) ||
    idNum <= 0
  ) {
    return { ok: false, error: new Error("commitLinePatch: lineId non valido") };
  }
  /** postgREST: string preserva bigint; number ok per integer classico */
  const idForEq: number | string =
    typeof args.lineId === "string" && /^\d+$/.test(String(args.lineId).trim())
      ? String(args.lineId).trim()
      : idNum;
  if (!Number.isFinite(args.appointmentId) || args.appointmentId <= 0) {
    return { ok: false, error: new Error("commitLinePatch: appointmentId non valido") };
  }
  const clean: Record<string, unknown> = {};
  if (args.patch.start_time !== undefined) clean.start_time = args.patch.start_time;
  if (args.patch.duration_minutes !== undefined)
    clean.duration_minutes = clampDurationMinutes(args.patch.duration_minutes);
  if (args.patch.staff_id !== undefined) clean.staff_id = args.patch.staff_id;
  if (!Object.keys(clean).length) return { ok: true };

  const { data: updatedRows, error } = await client
    .from("appointment_services")
    .update(clean)
    .eq("id", idForEq)
    .select("id");
  if (error) return { ok: false, error: new Error(error.message) };
  if (!updatedRows?.length) {
    return {
      ok: false,
      error: new Error(
        "commitLinePatch: update non applicato (0 righe su appointment_services). Verifica id riga e policy RLS."
      ),
    };
  }

  return syncAppointmentHeaderFromDb(client, args.appointmentId);
}
