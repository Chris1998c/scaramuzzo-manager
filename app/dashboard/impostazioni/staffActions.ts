"use server";

import { revalidatePath } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { getUserAccess } from "@/lib/getUserAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { STAFF_ROLE_OPTIONS } from "@/lib/staffSettings";
import { syncStaffSalons, syncStaffScheduleForSalon } from "@/lib/staffSalonsSync";

export type StaffSaveResult = { ok: true } | { ok: false; error: string };

const PIN_SALT_ROUNDS = 10;

/** Messaggi leggibili per errori PostgREST / Postgres noti sullo staff. */
function humanizeStaffDbError(err: PostgrestError): string {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  const details = (err.details ?? "").toLowerCase();

  if (code === "23505") {
    if (
      msg.includes("staff_staff_code_key") ||
      msg.includes("staff_code") ||
      details.includes("staff_code")
    ) {
      return "Questo codice collaboratore è già in uso. Scegline un altro.";
    }
    return "Esiste già un record con lo stesso valore univoco.";
  }

  if (code === "23514" || msg.includes("staff_role_check")) {
    return "Il ruolo selezionato non è consentito dal database.";
  }

  if (code === "23503") {
    return "Il salone indicato non è valido o non è più disponibile.";
  }

  const raw = err.message?.trim() ?? "Errore durante il salvataggio.";
  if (raw.length > 220) {
    return "Errore durante il salvataggio. Se persiste, controlla i dati o riprova.";
  }
  return raw;
}

async function assertCoordinatorSalons(salonIds: number[]) {
  const access = await getUserAccess();
  if (access.role !== "coordinator") {
    return {
      ok: false as const,
      error: "Solo il ruolo coordinator può modificare i collaboratori.",
    };
  }
  const unique = [...new Set(salonIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!unique.length) {
    return { ok: false as const, error: "Salone non valido." };
  }
  for (const salonId of unique) {
    if (!access.allowedSalonIds.includes(salonId)) {
      return { ok: false as const, error: "Non hai accesso a uno dei saloni selezionati." };
    }
  }
  return { ok: true as const, access };
}

function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  const email = String(raw).trim().toLowerCase();
  if (email.length > 120) throw new Error("Email troppo lunga (max 120 caratteri).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email non valida.");
  }
  return email;
}

type PinResolution =
  | { action: "none" }
  | { action: "clear" }
  | { action: "set"; rawPin: string };

function resolveMobilePin(
  mobileEnabled: boolean,
  pin: string | null | undefined,
  clearPin: boolean,
  hasExistingPin: boolean,
  isCreate: boolean,
): PinResolution {
  const trimmed = pin != null ? String(pin).trim() : "";

  if (clearPin) return { action: "clear" };

  if (trimmed) {
    if (!/^\d{4,8}$/.test(trimmed)) {
      throw new Error("Il PIN deve essere numerico, da 4 a 8 cifre.");
    }
    return { action: "set", rawPin: trimmed };
  }

  if (mobileEnabled && (isCreate || !hasExistingPin)) {
    throw new Error("Imposta un PIN per abilitare l'app collaboratori.");
  }

  return { action: "none" };
}

export type StaffPayload = {
  staff_code: string;
  salon_id: number;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  associated_salon_ids: number[];
  mobile_enabled: boolean;
  /** Nuovo PIN (solo cifre); vuoto = non cambiare. */
  mobile_pin?: string | null;
  clear_mobile_pin?: boolean;
  /** Giorni ISO 1–7 lavorativi sul salone primario; vuoto = tutti i giorni in agenda. */
  schedule_active_days: number[];
};

function normalizeStaffPayload(input: StaffPayload) {
  const staff_code = String(input.staff_code ?? "").trim().replace(/\s+/g, " ");
  if (!staff_code) throw new Error("Il codice collaboratore è obbligatorio.");
  if (staff_code.length > 64) throw new Error("Codice troppo lungo (max 64 caratteri).");
  if (/[\r\n\t]/.test(staff_code)) throw new Error("Il codice non può contenere tab o a capo.");

  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Il nome è obbligatorio.");

  const role = String(input.role ?? "").trim();
  if (!STAFF_ROLE_OPTIONS.includes(role as (typeof STAFF_ROLE_OPTIONS)[number])) {
    throw new Error("Ruolo non valido: usa uno dei valori consentiti (stylist, reception, …).");
  }

  const salon_id = Math.floor(Number(input.salon_id));
  if (!Number.isFinite(salon_id) || salon_id <= 0) {
    throw new Error("Seleziona un salone valido.");
  }

  let phone: string | null = null;
  if (input.phone != null && String(input.phone).trim() !== "") {
    phone = String(input.phone).trim();
    if (phone.length > 40) throw new Error("Telefono troppo lungo.");
  }

  const email = normalizeEmail(input.email);

  const associated = (input.associated_salon_ids ?? [])
    .map((id) => Math.floor(Number(id)))
    .filter((id) => Number.isFinite(id) && id > 0);

  const schedule_active_days = (input.schedule_active_days ?? [])
    .map((d) => Math.floor(Number(d)))
    .filter((d) => d >= 1 && d <= 7);

  return {
    staff_code,
    salon_id,
    name,
    role,
    phone,
    email,
    active: !!input.active,
    associated_salon_ids: associated,
    mobile_enabled: !!input.mobile_enabled,
    mobile_pin: input.mobile_pin,
    clear_mobile_pin: !!input.clear_mobile_pin,
    schedule_active_days,
  };
}

async function buildStaffUpdateFields(
  row: ReturnType<typeof normalizeStaffPayload>,
  opts: { isCreate: boolean; hasExistingPin: boolean },
): Promise<Record<string, unknown>> {
  const fields: Record<string, unknown> = {
    staff_code: row.staff_code,
    salon_id: row.salon_id,
    name: row.name,
    role: row.role,
    phone: row.phone,
    email: row.email,
    active: row.active,
    mobile_enabled: row.mobile_enabled,
  };

  const pinResult = resolveMobilePin(
    row.mobile_enabled,
    row.mobile_pin,
    row.clear_mobile_pin,
    opts.hasExistingPin,
    opts.isCreate,
  );

  if (pinResult.action === "clear") {
    fields.mobile_pin_hash = null;
  } else if (pinResult.action === "set") {
    fields.mobile_pin_hash = await bcrypt.hash(pinResult.rawPin, PIN_SALT_ROUNDS);
  }

  return fields;
}

async function persistStaffRelations(
  staffId: number,
  row: ReturnType<typeof normalizeStaffPayload>,
): Promise<StaffSaveResult> {
  const syncSalons = await syncStaffSalons(
    supabaseAdmin,
    staffId,
    row.salon_id,
    row.associated_salon_ids,
  );
  if (!syncSalons.ok) return syncSalons;

  const syncSched = await syncStaffScheduleForSalon(
    supabaseAdmin,
    staffId,
    row.salon_id,
    row.schedule_active_days,
  );
  if (!syncSched.ok) return syncSched;

  return { ok: true };
}

export async function createStaffAction(input: StaffPayload): Promise<StaffSaveResult> {
  let row: ReturnType<typeof normalizeStaffPayload>;
  try {
    row = normalizeStaffPayload(input);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Dati non validi.";
    return { ok: false, error: msg };
  }

  const salonIds = [row.salon_id, ...row.associated_salon_ids];
  const gate = await assertCoordinatorSalons(salonIds);
  if (!gate.ok) return gate;

  let insertFields: Record<string, unknown>;
  try {
    insertFields = await buildStaffUpdateFields(row, { isCreate: true, hasExistingPin: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Dati non validi.";
    return { ok: false, error: msg };
  }

  const { data: created, error } = await supabaseAdmin
    .from("staff")
    .insert(insertFields)
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: humanizeStaffDbError(error) };
  }

  const staffId = Number((created as { id?: unknown })?.id);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return { ok: false, error: "Collaboratore creato ma id non valido." };
  }

  const rel = await persistStaffRelations(staffId, row);
  if (!rel.ok) return rel;

  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}

export async function updateStaffAction(
  staffId: number,
  input: StaffPayload,
): Promise<StaffSaveResult> {
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return { ok: false, error: "Collaboratore non valido." };
  }

  let row: ReturnType<typeof normalizeStaffPayload>;
  try {
    row = normalizeStaffPayload(input);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Dati non validi.";
    return { ok: false, error: msg };
  }

  const salonIds = [row.salon_id, ...row.associated_salon_ids];
  const gate = await assertCoordinatorSalons(salonIds);
  if (!gate.ok) return gate;

  const { data: existing, error: exErr } = await supabaseAdmin
    .from("staff")
    .select("mobile_pin_hash")
    .eq("id", staffId)
    .maybeSingle();

  if (exErr) {
    return { ok: false, error: exErr.message };
  }

  const hasExistingPin =
    existing?.mobile_pin_hash != null && String(existing.mobile_pin_hash) !== "";

  let updateFields: Record<string, unknown>;
  try {
    updateFields = await buildStaffUpdateFields(row, { isCreate: false, hasExistingPin });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Dati non validi.";
    return { ok: false, error: msg };
  }

  const { error } = await supabaseAdmin.from("staff").update(updateFields).eq("id", staffId);

  if (error) {
    return { ok: false, error: humanizeStaffDbError(error) };
  }

  const rel = await persistStaffRelations(staffId, row);
  if (!rel.ok) return rel;

  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}
