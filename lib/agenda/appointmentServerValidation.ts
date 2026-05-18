import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clampDurationMinutes } from "@/lib/agenda/agendaContract";
import { fetchActiveStaffIdsForSalon } from "@/lib/staffForSalon";

export type ResolvedAgendaServiceLine = {
  service_id: number;
  duration_minutes: number;
  price: number;
  vat_rate: number;
};

type ValidationFail = { ok: false; error: string; status: number };
type ValidationOk<T> = { ok: true; data: T };

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Collaboratore attivo visibile sul salone (staff.salon_id legacy + staff_salons). */
export async function assertStaffBelongsToSalon(
  admin: SupabaseClient,
  staffId: number | null,
  salonId: number,
): Promise<ValidationOk<null> | ValidationFail> {
  if (staffId == null) return { ok: true, data: null };

  const allowed = await fetchActiveStaffIdsForSalon(admin, salonId);
  if (!allowed.includes(staffId)) {
    return {
      ok: false,
      error: "Il collaboratore selezionato non è disponibile per questo salone.",
      status: 403,
    };
  }

  return { ok: true, data: null };
}

/**
 * Risolve duration/prezzo/IVA da DB per righe agenda.
 * Prezzo: service_prices per salone, altrimenti services.price.
 */
export async function resolveAgendaServiceLines(
  admin: SupabaseClient,
  salonId: number,
  serviceIds: number[],
): Promise<ValidationOk<Map<number, ResolvedAgendaServiceLine>> | ValidationFail> {
  const unique = [...new Set(serviceIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!unique.length) {
    return { ok: false, error: "service_id non valido", status: 400 };
  }

  const { data: svcRows, error: svcErr } = await admin
    .from("services")
    .select("id, active, visible_in_agenda, duration, price, vat_rate")
    .in("id", unique);

  if (svcErr) {
    return { ok: false, error: svcErr.message, status: 500 };
  }

  const byId = new Map<number, Record<string, unknown>>();
  for (const row of svcRows ?? []) {
    const id = Number((row as { id: unknown }).id);
    if (Number.isInteger(id) && id > 0) {
      byId.set(id, row as Record<string, unknown>);
    }
  }

  for (const id of unique) {
    const row = byId.get(id);
    if (!row) {
      return { ok: false, error: `Servizio non trovato (id ${id}).`, status: 400 };
    }
    if (row.active === false) {
      return { ok: false, error: `Servizio non attivo (id ${id}).`, status: 400 };
    }
    if (row.visible_in_agenda === false) {
      return { ok: false, error: `Servizio non visibile in agenda (id ${id}).`, status: 400 };
    }
  }

  const { data: priceRows, error: priceErr } = await admin
    .from("service_prices")
    .select("service_id, price")
    .eq("salon_id", salonId)
    .in("service_id", unique);

  if (priceErr) {
    return { ok: false, error: priceErr.message, status: 500 };
  }

  const priceByService = new Map<number, number>();
  for (const pr of priceRows ?? []) {
    const sid = Number((pr as { service_id: unknown }).service_id);
    if (Number.isInteger(sid) && sid > 0) {
      priceByService.set(sid, toNum((pr as { price: unknown }).price, 0));
    }
  }

  const resolved = new Map<number, ResolvedAgendaServiceLine>();
  for (const id of unique) {
    const row = byId.get(id)!;
    const priceFromSalon = priceByService.get(id);
    resolved.set(id, {
      service_id: id,
      duration_minutes: clampDurationMinutes(row.duration),
      price: priceFromSalon !== undefined ? priceFromSalon : toNum(row.price, 0),
      vat_rate: toNum(row.vat_rate, 22),
    });
  }

  return { ok: true, data: resolved };
}
