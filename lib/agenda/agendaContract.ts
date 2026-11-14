import type { SupabaseClient } from "@supabase/supabase-js";
import { SLOT_MINUTES } from "@/components/agenda/utils";

export const AGENDA_LIST_SELECT = `
  id,
  start_time,
  end_time,
  status,
  sale_id,
  notes,
  source,
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
    duration_active,
    duration_processing,
    need_processing,
    staff_id,
    is_customer_composition_companion,
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
  normalized_start_time?: string;
  duration_minutes: number;
  /** Snapshot posa; null = riga storica senza snapshot → UI/busy full-duration. */
  duration_active: number | null;
  duration_processing: number | null;
  need_processing: boolean | null;
  staff_id: number | null;
  /**
   * true = riga aggiunta dalla composizione App Clienti (es. Shampoo companion).
   * Resta in dati/durata/cassa; nascosta solo in griglia Agenda.
   */
  is_customer_composition_companion: boolean;
  services: AgendaServiceEmbed;
};

export type AgendaAppointment = {
  id: number;
  start_time: string;
  end_time: string;
  status: string;
  sale_id: number | null;
  notes: string | null;
  source: string | null;
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

import { parseAgendaLocalTs as parseLocal } from "@/lib/agenda/agendaTimestamp";

export { parseLocal };

/** Ora corrente come wall clock Europe/Rome (allineato a timestamp without time zone in DB). */
export function nowRomeLocalDate(): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
    0,
  );
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

export function snapToAgendaSlot(date: Date, slotMinutes: number = SLOT_MINUTES): Date {
  const slot = Math.max(1, Number(slotMinutes) || SLOT_MINUTES);
  const slotMs = slot * 60_000;
  const snapped = new Date(Math.round(date.getTime() / slotMs) * slotMs);
  snapped.setSeconds(0, 0);
  return snapped;
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

/** Intervallo semi-aperto in minuti relativi all'inizio riga: [startOffset, endOffset). */
export type AgendaServiceMinuteInterval = {
  startOffsetMinutes: number;
  endOffsetMinutes: number;
};

export type AppointmentServiceOccupancyIntervals = {
  /** Sempre [0, duration_minutes) quando duration_minutes > 0; altrimenti [0, 0). */
  display: AgendaServiceMinuteInterval;
  /** Segmenti staff occupati (attivo e/o coda; senza posa valida: tutto il display). */
  busy: AgendaServiceMinuteInterval[];
  /** Solo la fascia di posa quando valida; altrimenti []. */
  free: AgendaServiceMinuteInterval[];
  processingValid: boolean;
};

function finiteNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Snapshot durata per nuove righe appointment_services da catalogo services.
 * - Sempre espone duration_active / duration_processing / need_processing (0/false se assenti).
 * - Se need_processing e A>0 e P>0: duration_minutes = max(duration, A+P) (poi clamp slot).
 * - Altrimenti: duration_minutes = clamp(duration) come oggi.
 */
export function resolveServiceDurationSnapshotForBooking(args: {
  duration: unknown;
  duration_active?: unknown;
  duration_processing?: unknown;
  need_processing?: unknown;
}): {
  duration_minutes: number;
  duration_active: number;
  duration_processing: number;
  need_processing: boolean;
} {
  const needProcessing = args.need_processing === true;
  const activeRaw = finiteNumberOrNull(args.duration_active);
  const processingRaw = finiteNumberOrNull(args.duration_processing);
  const durationActive =
    activeRaw != null && activeRaw > 0 ? Math.floor(activeRaw) : 0;
  const durationProcessing =
    processingRaw != null && processingRaw > 0 ? Math.floor(processingRaw) : 0;

  const baseDuration = clampDurationMinutes(args.duration);
  let durationMinutes = baseDuration;
  if (needProcessing && durationActive > 0 && durationProcessing > 0) {
    durationMinutes = clampDurationMinutes(
      Math.max(baseDuration, durationActive + durationProcessing),
    );
  }

  return {
    duration_minutes: durationMinutes,
    duration_active: durationActive,
    duration_processing: durationProcessing,
    need_processing: needProcessing,
  };
}

/**
 * Fasce display / busy / posa libera per una riga appointment_services.
 * Non arrotonda, non snappa orari; offset in minuti da start riga.
 *
 * Posa valida solo se need_processing, A > 0, P > 0 e A + P <= D.
 * Altrimenti tutto D resta occupato (nessun intervallo libero).
 */
export function resolveAppointmentServiceOccupancyIntervals(args: {
  duration_minutes: unknown;
  duration_active?: unknown;
  duration_processing?: unknown;
  need_processing?: unknown;
}): AppointmentServiceOccupancyIntervals {
  const D = finiteNumberOrNull(args.duration_minutes);
  const displayEnd = D != null && D > 0 ? D : 0;
  const display: AgendaServiceMinuteInterval = {
    startOffsetMinutes: 0,
    endOffsetMinutes: displayEnd,
  };

  const fullyBusy = (): AppointmentServiceOccupancyIntervals => ({
    display,
    busy:
      displayEnd > 0
        ? [{ startOffsetMinutes: 0, endOffsetMinutes: displayEnd }]
        : [],
    free: [],
    processingValid: false,
  });

  if (D == null || D <= 0) return fullyBusy();

  const needProcessing = args.need_processing === true;
  const A = finiteNumberOrNull(args.duration_active);
  const P = finiteNumberOrNull(args.duration_processing);

  if (!needProcessing || A == null || P == null || A <= 0 || P <= 0 || A + P > D) {
    return fullyBusy();
  }

  const busy: AgendaServiceMinuteInterval[] = [
    { startOffsetMinutes: 0, endOffsetMinutes: A },
  ];
  if (A + P < D) {
    busy.push({ startOffsetMinutes: A + P, endOffsetMinutes: D });
  }

  return {
    display,
    busy,
    free: [{ startOffsetMinutes: A, endOffsetMinutes: A + P }],
    processingValid: true,
  };
}

export type AgendaAbsoluteMsInterval = {
  startMs: number;
  endMs: number;
};

/**
 * Segmenti busy assoluti (ms epoch locale parseLocal) da start_time + snapshot.
 * Senza snapshot/posa valida → un solo [start, start+D).
 */
export function appointmentServiceBusyAbsoluteIntervals(args: {
  startTime: string;
  duration_minutes: unknown;
  duration_active?: unknown;
  duration_processing?: unknown;
  need_processing?: unknown;
}): AgendaAbsoluteMsInterval[] {
  const startMs = parseLocal(args.startTime).getTime();
  if (!Number.isFinite(startMs)) return [];

  const occ = resolveAppointmentServiceOccupancyIntervals({
    duration_minutes: args.duration_minutes,
    duration_active: args.duration_active,
    duration_processing: args.duration_processing,
    need_processing: args.need_processing,
  });

  const out: AgendaAbsoluteMsInterval[] = [];
  for (const b of occ.busy) {
    const segStart = startMs + b.startOffsetMinutes * 60_000;
    const segEnd = startMs + b.endOffsetMinutes * 60_000;
    if (segEnd > segStart) out.push({ startMs: segStart, endMs: segEnd });
  }
  return out;
}

/** True se almeno un intervallo di A overlap-pa (semi-aperto) uno di B. */
export function absoluteIntervalsOverlapAny(
  a: AgendaAbsoluteMsInterval[],
  b: AgendaAbsoluteMsInterval[],
): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x.startMs < y.endMs && y.startMs < x.endMs) return true;
    }
  }
  return false;
}

/**
 * Busy della prenotazione proposta (timeline sequenziale + snapshot per riga).
 * Prima riga: start snappato; successive: fine reale della precedente.
 */
export function buildProposedBookingBusyIntervals(args: {
  startTime: string;
  lines: Array<{
    duration_minutes: number;
    duration_active?: number | null;
    duration_processing?: number | null;
    need_processing?: boolean | null;
  }>;
}): AgendaAbsoluteMsInterval[] {
  const out: AgendaAbsoluteMsInterval[] = [];
  let cursorMs = parseLocal(args.startTime).getTime();
  if (!Number.isFinite(cursorMs)) return out;

  for (let i = 0; i < args.lines.length; i++) {
    const line = args.lines[i]!;
    const lineStart =
      i === 0
        ? toNoZ(snapToAgendaSlot(parseLocal(args.startTime)))
        : toNoZ(new Date(cursorMs));
    out.push(
      ...appointmentServiceBusyAbsoluteIntervals({
        startTime: lineStart,
        duration_minutes: line.duration_minutes,
        duration_active: line.duration_active,
        duration_processing: line.duration_processing,
        need_processing: line.need_processing,
      }),
    );
    cursorMs = parseLocal(lineStart).getTime() + line.duration_minutes * 60_000;
  }
  return out;
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
  // Non snappare gli start riga prima del MAX end: con durate non-15 (es. 20+20)
  // lo snap indietro (10:20→10:15) accorciava l'header rispetto a busy reale / availability.
  const normalized = lines.map((ln) => ({
    ...ln,
    start_time: toNoZ(parseLocal(ln.start_time)),
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
    start_time: toNoZ(snapToAgendaSlot(new Date(minStartMs))),
    end_time: toNoZ(new Date(maxEndMs)),
    staff_id: normalizeStaffId(first.staff_id),
  };
}

export function normalizeAgendaRows(raw: unknown[] | null): AgendaAppointment[] {
  if (!raw?.length) return [];
  const mapped: AgendaAppointment[] = (raw as Record<string, unknown>[]).map((row) => {
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
      sale_id: (() => {
        const sid = row.sale_id;
        if (sid == null || sid === "") return null;
        const n = Number(sid);
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
      notes: row.notes == null || row.notes === "" ? null : String(row.notes),
      source:
        row.source == null || row.source === "" ? null : String(row.source),
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
        const activeRaw = finiteNumberOrNull(ln.duration_active);
        const processingRaw = finiteNumberOrNull(ln.duration_processing);
        return {
          id: Number(ln.id),
          appointment_id: Number(ln.appointment_id ?? aid),
          service_id: Number.isFinite(sid) ? sid : 0,
          start_time: String(ln.start_time ?? ""),
          normalized_start_time: toNoZ(snapToAgendaSlot(parseLocal(String(ln.start_time ?? "")))),
          duration_minutes: dur,
          duration_active:
            ln.duration_active === null || ln.duration_active === undefined
              ? null
              : activeRaw,
          duration_processing:
            ln.duration_processing === null || ln.duration_processing === undefined
              ? null
              : processingRaw,
          need_processing:
            ln.need_processing === null || ln.need_processing === undefined
              ? null
              : ln.need_processing === true,
          staff_id: normalizeStaffId(ln.staff_id),
          is_customer_composition_companion:
            ln.is_customer_composition_companion === true,
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
  return mapped.filter((app) => Number.isFinite(app.id) && app.id > 0);
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
  if (args.patch.start_time !== undefined) {
    clean.start_time = toNoZ(snapToAgendaSlot(parseLocal(args.patch.start_time)));
  }
  if (args.patch.duration_minutes !== undefined)
    clean.duration_minutes = clampDurationMinutes(args.patch.duration_minutes);
  if (args.patch.staff_id !== undefined) clean.staff_id = args.patch.staff_id;
  if (!Object.keys(clean).length) return { ok: true };
  void client;
  void idForEq;
  const res = await fetch(`/api/agenda/lines/${encodeURIComponent(String(args.lineId))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(clean),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
  if (!res.ok) {
    return {
      ok: false,
      error: new Error(
        json.error || json.details || `commitLinePatch: PATCH /api/agenda/lines failed (${res.status})`
      ),
    };
  }
  return { ok: true };
}
