"use server";

import { revalidatePath } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchActiveStaffForSalon, fetchActiveStaffIdsForSalon } from "@/lib/staffForSalon";
import {
  normalizeOptionalTime,
  parseYearMonth,
  validateIsoDate,
  validateTimeWindow,
  type OperationalCalendarMonthData,
  type SalonOperationalDayRow,
  type StaffScheduleOverrideRow,
} from "@/lib/operationalCalendarSettings";

export type OperationalCalendarActionResult =
  | { ok: true }
  | { ok: false; error: string };

function humanizeDbError(err: PostgrestError): string {
  const code = err.code ?? "";
  if (code === "23505") {
    return "Esiste già un'eccezione per questa data (salone o collaboratore). Modifica quella esistente.";
  }
  const raw = err.message?.trim() ?? "Errore durante il salvataggio.";
  return raw.length > 220 ? "Errore durante il salvataggio. Riprova." : raw;
}

async function assertSalonRead(salonId: number) {
  const access = await getUserAccess();
  if (!Number.isFinite(salonId) || salonId <= 0) {
    return { ok: false as const, error: "Salone non valido." };
  }
  if (!access.allowedSalonIds.includes(salonId)) {
    return { ok: false as const, error: "Non hai accesso a questo salone." };
  }
  return { ok: true as const, access };
}

async function assertCoordinatorSalon(salonId: number) {
  const access = await getUserAccess();
  if (access.role !== "coordinator") {
    return {
      ok: false as const,
      error: "Solo il ruolo coordinator può modificare il calendario operativo.",
    };
  }
  if (!Number.isFinite(salonId) || salonId <= 0) {
    return { ok: false as const, error: "Salone non valido." };
  }
  if (!access.allowedSalonIds.includes(salonId)) {
    return { ok: false as const, error: "Non hai accesso a questo salone." };
  }
  return { ok: true as const, access };
}

async function authUserId(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

function mapSalonRow(row: Record<string, unknown>): SalonOperationalDayRow {
  return {
    id: Number(row.id),
    salon_id: Number(row.salon_id),
    operative_date: String(row.operative_date ?? "").slice(0, 10),
    kind: row.kind === "closed" ? "closed" : "open_extra",
    open_start_time: normalizeOptionalTime(row.open_start_time as string | null),
    open_end_time: normalizeOptionalTime(row.open_end_time as string | null),
    notes: row.notes != null && String(row.notes).trim() !== "" ? String(row.notes).trim() : null,
  };
}

function mapStaffRow(
  row: Record<string, unknown>,
  staffNames: Map<number, string>,
): StaffScheduleOverrideRow {
  const staffId = Number(row.staff_id);
  return {
    id: Number(row.id),
    salon_id: Number(row.salon_id),
    staff_id: staffId,
    staff_name: staffNames.get(staffId) ?? `Collaboratore #${staffId}`,
    operative_date: String(row.operative_date ?? "").slice(0, 10),
    kind: row.kind === "unavailable" ? "unavailable" : "available",
    start_time: normalizeOptionalTime(row.start_time as string | null),
    end_time: normalizeOptionalTime(row.end_time as string | null),
    notes: row.notes != null && String(row.notes).trim() !== "" ? String(row.notes).trim() : null,
  };
}

export async function fetchOperationalCalendarMonthAction(
  salonId: number,
  yearMonth: string,
): Promise<
  | { ok: true; data: OperationalCalendarMonthData }
  | { ok: false; error: string }
> {
  const gate = await assertSalonRead(salonId);
  if (!gate.ok) return gate;

  const range = parseYearMonth(yearMonth);
  if (!range) return { ok: false, error: "Mese non valido." };

  const [{ data: salonRows, error: sErr }, { data: staffRows, error: stErr }] =
    await Promise.all([
      supabaseAdmin
        .from("salon_operational_days")
        .select("id, salon_id, operative_date, kind, open_start_time, open_end_time, notes")
        .eq("salon_id", salonId)
        .gte("operative_date", range.from)
        .lte("operative_date", range.to)
        .order("operative_date", { ascending: true }),
      supabaseAdmin
        .from("staff_schedule_date_overrides")
        .select("id, salon_id, staff_id, operative_date, kind, start_time, end_time, notes")
        .eq("salon_id", salonId)
        .gte("operative_date", range.from)
        .lte("operative_date", range.to)
        .order("operative_date", { ascending: true })
        .order("staff_id", { ascending: true }),
    ]);

  if (sErr) return { ok: false, error: sErr.message };
  if (stErr) return { ok: false, error: stErr.message };

  const staffIds = [
    ...new Set(
      (staffRows ?? [])
        .map((r) => Number((r as { staff_id?: unknown }).staff_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  const staffNames = new Map<number, string>();
  if (staffIds.length) {
    const { data: names, error: nErr } = await supabaseAdmin
      .from("staff")
      .select("id, name")
      .in("id", staffIds);
    if (nErr) return { ok: false, error: nErr.message };
    for (const n of names ?? []) {
      const id = Number((n as { id: unknown }).id);
      staffNames.set(id, String((n as { name: unknown }).name ?? ""));
    }
  }

  return {
    ok: true,
    data: {
      salonDays: (salonRows ?? []).map((r) => mapSalonRow(r as Record<string, unknown>)),
      staffOverrides: (staffRows ?? []).map((r) =>
        mapStaffRow(r as Record<string, unknown>, staffNames),
      ),
    },
  };
}

export async function fetchSalonStaffForOperationalCalendarAction(
  salonId: number,
): Promise<
  | { ok: true; staff: Array<{ id: number; name: string }> }
  | { ok: false; error: string }
> {
  const gate = await assertSalonRead(salonId);
  if (!gate.ok) return gate;

  try {
    const rows = await fetchActiveStaffForSalon(supabaseAdmin, salonId, "id, name");
    const staff = rows
      .map((r) => ({
        id: Number(r.id),
        name: String(r.name ?? "").trim(),
      }))
      .filter((s) => s.id > 0 && s.name);
    return { ok: true, staff };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore caricamento collaboratori.",
    };
  }
}

export type SaveSalonOperationalDayPayload = {
  id?: number | null;
  salon_id: number;
  operative_date: string;
  kind: "open_extra" | "closed";
  open_start_time?: string | null;
  open_end_time?: string | null;
  notes?: string | null;
};

export async function saveSalonOperationalDayAction(
  payload: SaveSalonOperationalDayPayload,
): Promise<OperationalCalendarActionResult> {
  const salonId = Number(payload.salon_id);
  const gate = await assertCoordinatorSalon(salonId);
  if (!gate.ok) return gate;

  const isoDate = String(payload.operative_date ?? "").trim();
  const dateErr = validateIsoDate(isoDate);
  if (dateErr) return { ok: false, error: dateErr };

  const kind = payload.kind === "closed" ? "closed" : "open_extra";
  const openStart =
    kind === "open_extra" ? normalizeOptionalTime(payload.open_start_time) : null;
  const openEnd =
    kind === "open_extra" ? normalizeOptionalTime(payload.open_end_time) : null;
  const windowErr = validateTimeWindow(openStart, openEnd);
  if (windowErr) return { ok: false, error: windowErr };

  const notes =
    payload.notes != null && String(payload.notes).trim() !== ""
      ? String(payload.notes).trim().slice(0, 500)
      : null;

  const createdBy = await authUserId();
  const row = {
    salon_id: salonId,
    operative_date: isoDate,
    kind,
    open_start_time: openStart,
    open_end_time: openEnd,
    notes,
    ...(createdBy ? { created_by: createdBy } : {}),
  };

  const id = payload.id != null ? Number(payload.id) : null;
  if (id != null && Number.isFinite(id) && id > 0) {
    const { error } = await supabaseAdmin
      .from("salon_operational_days")
      .update({
        operative_date: isoDate,
        kind,
        open_start_time: openStart,
        open_end_time: openEnd,
        notes,
      })
      .eq("id", id)
      .eq("salon_id", salonId);
    if (error) return { ok: false, error: humanizeDbError(error) };
  } else {
    const { error } = await supabaseAdmin
      .from("salon_operational_days")
      .upsert(row, { onConflict: "salon_id,operative_date" });
    if (error) return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}

export type SaveStaffScheduleOverridePayload = {
  id?: number | null;
  salon_id: number;
  staff_id: number;
  operative_date: string;
  kind: "available" | "unavailable";
  start_time?: string | null;
  end_time?: string | null;
  notes?: string | null;
};

export async function saveStaffScheduleOverrideAction(
  payload: SaveStaffScheduleOverridePayload,
): Promise<OperationalCalendarActionResult> {
  const salonId = Number(payload.salon_id);
  const gate = await assertCoordinatorSalon(salonId);
  if (!gate.ok) return gate;

  const staffId = Number(payload.staff_id);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return { ok: false, error: "Seleziona un collaboratore." };
  }

  const isoDate = String(payload.operative_date ?? "").trim();
  const dateErr = validateIsoDate(isoDate);
  if (dateErr) return { ok: false, error: dateErr };

  const kind = payload.kind === "unavailable" ? "unavailable" : "available";
  const startTime = normalizeOptionalTime(payload.start_time);
  const endTime = normalizeOptionalTime(payload.end_time);
  const windowErr = validateTimeWindow(startTime, endTime);
  if (windowErr) return { ok: false, error: windowErr };

  const allowedStaff = await fetchActiveStaffIdsForSalon(supabaseAdmin, salonId);
  if (!allowedStaff.includes(staffId)) {
    return {
      ok: false,
      error: "Il collaboratore selezionato non è disponibile per questo salone.",
    };
  }

  const notes =
    payload.notes != null && String(payload.notes).trim() !== ""
      ? String(payload.notes).trim().slice(0, 500)
      : null;

  const createdBy = await authUserId();
  const row = {
    salon_id: salonId,
    staff_id: staffId,
    operative_date: isoDate,
    kind,
    start_time: startTime,
    end_time: endTime,
    notes,
    ...(createdBy ? { created_by: createdBy } : {}),
  };

  const id = payload.id != null ? Number(payload.id) : null;
  if (id != null && Number.isFinite(id) && id > 0) {
    const { error } = await supabaseAdmin
      .from("staff_schedule_date_overrides")
      .update({
        staff_id: staffId,
        operative_date: isoDate,
        kind,
        start_time: startTime,
        end_time: endTime,
        notes,
      })
      .eq("id", id)
      .eq("salon_id", salonId);
    if (error) return { ok: false, error: humanizeDbError(error) };
  } else {
    const { error } = await supabaseAdmin
      .from("staff_schedule_date_overrides")
      .upsert(row, { onConflict: "salon_id,staff_id,operative_date" });
    if (error) return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}

export async function deleteSalonOperationalDayAction(
  id: number,
  salonId: number,
): Promise<OperationalCalendarActionResult> {
  const gate = await assertCoordinatorSalon(salonId);
  if (!gate.ok) return gate;
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Record non valido." };

  const { error } = await supabaseAdmin
    .from("salon_operational_days")
    .delete()
    .eq("id", id)
    .eq("salon_id", salonId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}

export async function deleteStaffScheduleOverrideAction(
  id: number,
  salonId: number,
): Promise<OperationalCalendarActionResult> {
  const gate = await assertCoordinatorSalon(salonId);
  if (!gate.ok) return gate;
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Record non valido." };

  const { error } = await supabaseAdmin
    .from("staff_schedule_date_overrides")
    .delete()
    .eq("id", id)
    .eq("salon_id", salonId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}
