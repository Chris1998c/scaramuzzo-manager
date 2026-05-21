import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkStaffAppointmentScheduleWindow,
  minutesFromAgendaStartTime,
  normalizeScheduleTime,
  salonDefaultScheduleWindow,
  scheduleTimeToMinutes,
  type StaffScheduleBySalon,
} from "@/lib/staffSchedule";

export type SalonOperationalDayKind = "open_extra" | "closed";
export type StaffDateOverrideKind = "available" | "unavailable";

export type SalonOperationalDay = {
  kind: SalonOperationalDayKind;
  openStartTime: string | null;
  openEndTime: string | null;
};

export type StaffDateOverride = {
  kind: StaffDateOverrideKind;
  startTime: string | null;
  endTime: string | null;
};

export type OperationalCalendarSnapshot = {
  salonDay: SalonOperationalDay | null;
  /** staff_id (string) → override per la data caricata */
  staffOverrides: Map<string, StaffDateOverride>;
};

export type StaffAvailabilityResolution =
  | { ok: true }
  | {
      ok: false;
      code:
        | "salon_closed"
        | "staff_unavailable"
        | "override_time"
        | "schedule_day"
        | "schedule_time";
    };

function mapSalonOperationalRow(row: {
  kind?: unknown;
  open_start_time?: unknown;
  open_end_time?: unknown;
}): SalonOperationalDay | null {
  const kind = String(row.kind ?? "").trim();
  if (kind !== "open_extra" && kind !== "closed") return null;
  return {
    kind,
    openStartTime: normalizeScheduleTime(row.open_start_time),
    openEndTime: normalizeScheduleTime(row.open_end_time),
  };
}

function mapStaffOverrideRow(row: {
  kind?: unknown;
  start_time?: unknown;
  end_time?: unknown;
}): StaffDateOverride | null {
  const kind = String(row.kind ?? "").trim();
  if (kind !== "available" && kind !== "unavailable") return null;
  return {
    kind,
    startTime: normalizeScheduleTime(row.start_time),
    endTime: normalizeScheduleTime(row.end_time),
  };
}

export async function fetchSalonOperationalDay(
  supabase: SupabaseClient,
  salonId: number,
  isoDate: string,
): Promise<SalonOperationalDay | null> {
  if (!Number.isFinite(salonId) || salonId <= 0 || !isoDate) return null;

  const { data, error } = await supabase
    .from("salon_operational_days")
    .select("kind, open_start_time, open_end_time")
    .eq("salon_id", salonId)
    .eq("operative_date", isoDate)
    .maybeSingle();

  if (error) {
    console.warn("salon_operational_days fetch:", error.message);
    return null;
  }
  if (!data) return null;
  return mapSalonOperationalRow(data);
}

export async function fetchStaffDateOverride(
  supabase: SupabaseClient,
  salonId: number,
  staffId: number,
  isoDate: string,
): Promise<StaffDateOverride | null> {
  if (!Number.isFinite(salonId) || salonId <= 0 || !Number.isFinite(staffId) || staffId <= 0 || !isoDate) {
    return null;
  }

  const { data, error } = await supabase
    .from("staff_schedule_date_overrides")
    .select("kind, start_time, end_time")
    .eq("salon_id", salonId)
    .eq("staff_id", staffId)
    .eq("operative_date", isoDate)
    .maybeSingle();

  if (error) {
    console.warn("staff_schedule_date_overrides fetch:", error.message);
    return null;
  }
  if (!data) return null;
  return mapStaffOverrideRow(data);
}

/**
 * Carica eccezione salone + override staff per una data (max 2 query).
 * staffIds opzionale: se vuoto, carica tutti gli override del salone in quella data.
 */
export async function fetchOperationalCalendarSnapshot(
  supabase: SupabaseClient,
  salonId: number,
  isoDate: string,
  staffIds?: number[],
): Promise<OperationalCalendarSnapshot> {
  const staffOverrides = new Map<string, StaffDateOverride>();

  const salonDay = await fetchSalonOperationalDay(supabase, salonId, isoDate);

  let q = supabase
    .from("staff_schedule_date_overrides")
    .select("staff_id, kind, start_time, end_time")
    .eq("salon_id", salonId)
    .eq("operative_date", isoDate);

  const ids = (staffIds ?? []).filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length > 0) {
    q = q.in("staff_id", ids);
  }

  const { data, error } = await q;
  if (error) {
    console.warn("staff_schedule_date_overrides batch fetch:", error.message);
    return { salonDay, staffOverrides };
  }

  for (const row of data ?? []) {
    const r = row as { staff_id?: unknown };
    const sid = r.staff_id != null ? String(r.staff_id) : "";
    if (!sid) continue;
    const mapped = mapStaffOverrideRow(row as { kind?: unknown; start_time?: unknown; end_time?: unknown });
    if (mapped) staffOverrides.set(sid, mapped);
  }

  return { salonDay, staffOverrides };
}

export type OperationalCalendarRange = {
  salonDaysByDate: Map<string, SalonOperationalDay>;
  staffOverridesByDate: Map<string, Map<string, StaffDateOverride>>;
};

/**
 * Eccezioni salone e override staff in un intervallo di date (2 query).
 * staffOverridesByDate: isoDate → staff_id → override.
 */
export async function fetchOperationalCalendarRange(
  supabase: SupabaseClient,
  salonId: number,
  fromIso: string,
  toIso: string,
): Promise<OperationalCalendarRange> {
  const salonDaysByDate = new Map<string, SalonOperationalDay>();
  const staffOverridesByDate = new Map<string, Map<string, StaffDateOverride>>();

  if (!Number.isFinite(salonId) || salonId <= 0 || !fromIso || !toIso) {
    return { salonDaysByDate, staffOverridesByDate };
  }

  const [{ data: salonRows, error: sErr }, { data: staffRows, error: stErr }] =
    await Promise.all([
      supabase
        .from("salon_operational_days")
        .select("operative_date, kind, open_start_time, open_end_time")
        .eq("salon_id", salonId)
        .gte("operative_date", fromIso)
        .lte("operative_date", toIso),
      supabase
        .from("staff_schedule_date_overrides")
        .select("staff_id, operative_date, kind, start_time, end_time")
        .eq("salon_id", salonId)
        .gte("operative_date", fromIso)
        .lte("operative_date", toIso),
    ]);

  if (sErr) console.warn("salon_operational_days range fetch:", sErr.message);
  else {
    for (const row of salonRows ?? []) {
      const r = row as { operative_date?: unknown };
      const iso = String(r.operative_date ?? "").slice(0, 10);
      if (!iso) continue;
      const mapped = mapSalonOperationalRow(row as Record<string, unknown>);
      if (mapped) salonDaysByDate.set(iso, mapped);
    }
  }

  if (stErr) console.warn("staff_schedule_date_overrides range fetch:", stErr.message);
  else {
    for (const row of staffRows ?? []) {
      const r = row as { operative_date?: unknown; staff_id?: unknown };
      const iso = String(r.operative_date ?? "").slice(0, 10);
      const sid = r.staff_id != null ? String(r.staff_id) : "";
      if (!iso || !sid) continue;
      const mapped = mapStaffOverrideRow(row as { kind?: unknown; start_time?: unknown; end_time?: unknown });
      if (!mapped) continue;
      if (!staffOverridesByDate.has(iso)) {
        staffOverridesByDate.set(iso, new Map());
      }
      staffOverridesByDate.get(iso)!.set(sid, mapped);
    }
  }

  return { salonDaysByDate, staffOverridesByDate };
}

export function isSalonClosedOnDate(salonDay: SalonOperationalDay | null | undefined): boolean {
  return salonDay?.kind === "closed";
}

export function isSalonExtraOpenOnDate(salonDay: SalonOperationalDay | null | undefined): boolean {
  return salonDay?.kind === "open_extra";
}

function resolveAvailabilityWindowMinutes(input: {
  salonId: number;
  salonDay: SalonOperationalDay | null;
  staffOverride: StaffDateOverride;
}): { startMinutes: number; endMinutes: number } {
  const overrideStart = scheduleTimeToMinutes(input.staffOverride.startTime);
  const overrideEnd = scheduleTimeToMinutes(input.staffOverride.endTime);
  if (overrideStart != null && overrideEnd != null) {
    return { startMinutes: overrideStart, endMinutes: overrideEnd };
  }

  if (
    isSalonExtraOpenOnDate(input.salonDay) &&
    input.salonDay &&
    input.salonDay.openStartTime &&
    input.salonDay.openEndTime
  ) {
    const openStart = scheduleTimeToMinutes(input.salonDay.openStartTime);
    const openEnd = scheduleTimeToMinutes(input.salonDay.openEndTime);
    if (openStart != null && openEnd != null) {
      return { startMinutes: openStart, endMinutes: openEnd };
    }
  }

  return salonDefaultScheduleWindow(input.salonId);
}

function appointmentWithinWindow(
  startTime: string,
  durationMinutes: number,
  window: { startMinutes: number; endMinutes: number },
): boolean {
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return true;
  const apptStart = minutesFromAgendaStartTime(startTime);
  const apptEnd = apptStart + duration;
  return apptStart >= window.startMinutes && apptEnd <= window.endMinutes;
}

/**
 * Precedenza: chiusura salone → unavailable staff → available (salta turno settimanale) → turno settimanale → legacy.
 */
export function resolveStaffAvailabilityForDate(input: {
  salonId: number;
  isoDate: string;
  staffId: number | string;
  startTime: string;
  durationMinutes: number;
  salonDay: SalonOperationalDay | null;
  staffOverride: StaffDateOverride | null;
  scheduleMap: StaffScheduleBySalon;
}): StaffAvailabilityResolution {
  if (isSalonClosedOnDate(input.salonDay)) {
    return { ok: false, code: "salon_closed" };
  }

  if (input.staffOverride?.kind === "unavailable") {
    return { ok: false, code: "staff_unavailable" };
  }

  if (input.staffOverride?.kind === "available") {
    const window = resolveAvailabilityWindowMinutes({
      salonId: input.salonId,
      salonDay: input.salonDay,
      staffOverride: input.staffOverride,
    });
    if (
      !appointmentWithinWindow(input.startTime, input.durationMinutes, window)
    ) {
      return { ok: false, code: "override_time" };
    }
    return { ok: true };
  }

  const weekly = checkStaffAppointmentScheduleWindow({
    scheduleMap: input.scheduleMap,
    staffId: input.staffId,
    salonId: input.salonId,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
  });

  if (weekly.ok) return { ok: true };
  return {
    ok: false,
    code: weekly.kind === "time" ? "schedule_time" : "schedule_day",
  };
}
