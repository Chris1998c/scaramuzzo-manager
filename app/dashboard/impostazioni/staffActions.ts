"use server";

import { revalidatePath } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import { getUserAccess } from "@/lib/getUserAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { STAFF_ROLE_OPTIONS } from "@/lib/staffSettings";

export type StaffSaveResult = { ok: true } | { ok: false; error: string };

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

async function assertCoordinatorSalon(salonId: number) {
  const access = await getUserAccess();
  if (access.role !== "coordinator") {
    return {
      ok: false as const,
      error: "Solo il ruolo coordinator può modificare i collaboratori.",
    };
  }
  if (!Number.isFinite(salonId) || salonId <= 0) {
    return { ok: false as const, error: "Salone non valido." };
  }
  if (!access.allowedSalonIds.includes(salonId)) {
    return { ok: false as const, error: "Non hai accesso a questo salone." };
  }
  return { ok: true as const };
}

export type StaffPayload = {
  staff_code: string;
  salon_id: number;
  name: string;
  role: string;
  phone: string | null;
  active: boolean;
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

  return {
    staff_code,
    salon_id,
    name,
    role,
    phone,
    active: !!input.active,
  };
}

export async function createStaffAction(input: StaffPayload): Promise<StaffSaveResult> {
  let row: ReturnType<typeof normalizeStaffPayload>;
  try {
    row = normalizeStaffPayload(input);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Dati non validi.";
    return { ok: false, error: msg };
  }

  const gate = await assertCoordinatorSalon(row.salon_id);
  if (!gate.ok) return gate;

  const { error } = await supabaseAdmin.from("staff").insert({
    staff_code: row.staff_code,
    salon_id: row.salon_id,
    name: row.name,
    role: row.role,
    phone: row.phone,
    active: row.active,
  });

  if (error) {
    return { ok: false, error: humanizeStaffDbError(error) };
  }

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

  const gate = await assertCoordinatorSalon(row.salon_id);
  if (!gate.ok) return gate;

  const { error } = await supabaseAdmin
    .from("staff")
    .update({
      staff_code: row.staff_code,
      salon_id: row.salon_id,
      name: row.name,
      role: row.role,
      phone: row.phone,
      active: row.active,
    })
    .eq("id", staffId);

  if (error) {
    return { ok: false, error: humanizeStaffDbError(error) };
  }

  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}
