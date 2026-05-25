import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAgendaPaletteKey, type AgendaPaletteKey } from "@/lib/agendaServiceVisual";

export const CUSTOMER_BOOKING_PIEGA_REQUIRED_MESSAGE =
  "Per completare questa prenotazione aggiungi anche una piega.";

export type CustomerAppServiceCatalogRow = {
  id: number;
  name: string;
  category_name: string | null;
  need_processing: boolean;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function haystack(row: CustomerAppServiceCatalogRow): string {
  const cat = row.category_name ? norm(row.category_name) : "";
  const svc = norm(row.name);
  return [cat, svc].filter(Boolean).join(" | ");
}

/** Piega / asciugatura / phon (palette dedicata). */
export function isCustomerAppPiegaService(row: CustomerAppServiceCatalogRow): boolean {
  return (
    resolveAgendaPaletteKey({
      serviceName: row.name,
      categoryName: row.category_name,
    }) === "piega"
  );
}

/** Taglio uomo / barber — escluso dalla regola piega obbligatoria. */
export function isCustomerAppMensHaircutService(row: CustomerAppServiceCatalogRow): boolean {
  const hay = haystack(row);
  if (
    /taglio\s*uomo|uomo\s*taglio|taglio\s*men|men\s*cut|barber|barbiere|barba\b/.test(
      hay,
    )
  ) {
    return true;
  }
  const key = resolveAgendaPaletteKey({
    serviceName: row.name,
    categoryName: row.category_name,
  });
  if (key === "taglio" && /\buomo\b|\bmen\b|barber|barba\b/.test(hay)) {
    return true;
  }
  return false;
}

const REQUIRES_PIEGA_PALETTE_KEYS = new Set<AgendaPaletteKey>([
  "colorazione",
  "schiariture",
  "styling",
]);

function isCustomerAppTechnicalService(row: CustomerAppServiceCatalogRow): boolean {
  if (row.need_processing) return true;
  const hay = haystack(row);
  if (/\btecnico\b|technical|preparaz|svern|mordenz|decap|applicaz/.test(hay)) {
    return true;
  }
  return (
    resolveAgendaPaletteKey({
      serviceName: row.name,
      categoryName: row.category_name,
    }) === "trattamento"
  );
}

/** Servizi che obbligano la presenza di una piega nello stesso booking. */
export function serviceRequiresPiegaCompanion(row: CustomerAppServiceCatalogRow): boolean {
  if (isCustomerAppPiegaService(row) || isCustomerAppMensHaircutService(row)) {
    return false;
  }

  const paletteKey = resolveAgendaPaletteKey({
    serviceName: row.name,
    categoryName: row.category_name,
  });

  if (REQUIRES_PIEGA_PALETTE_KEYS.has(paletteKey)) {
    return true;
  }

  if (paletteKey === "taglio") {
    return true;
  }

  if (isCustomerAppTechnicalService(row)) {
    return true;
  }

  return false;
}

export type EvaluateCustomerBookingPiegaResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Regola business: colore / styling / tecnico / taglio donna richiedono almeno un servizio piega.
 * Taglio uomo e piega da sola sono consentiti senza altri servizi piega.
 */
export function evaluateCustomerBookingPiegaRule(
  rows: CustomerAppServiceCatalogRow[],
): EvaluateCustomerBookingPiegaResult {
  if (!rows.length) {
    return { ok: true };
  }

  const needsPiega = rows.some(serviceRequiresPiegaCompanion);
  const hasPiega = rows.some(isCustomerAppPiegaService);

  if (needsPiega && !hasPiega) {
    return { ok: false, message: CUSTOMER_BOOKING_PIEGA_REQUIRED_MESSAGE };
  }

  return { ok: true };
}

export async function fetchCustomerAppServiceCatalogRows(
  admin: SupabaseClient,
  serviceIds: number[],
): Promise<CustomerAppServiceCatalogRow[]> {
  const unique = [...new Set(serviceIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!unique.length) return [];

  const { data, error } = await admin
    .from("services")
    .select("id, name, need_processing, service_categories(name)")
    .in("id", unique);

  if (error) {
    throw new Error(`services catalog: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const row = raw as {
      id: unknown;
      name: unknown;
      need_processing?: unknown;
      service_categories?: { name?: unknown } | null;
    };
    const cat = row.service_categories;
    const category_name =
      cat?.name != null && String(cat.name).trim() !== ""
        ? String(cat.name)
        : null;
    return {
      id: Number(row.id),
      name: String(row.name ?? ""),
      category_name,
      need_processing: row.need_processing === true,
    };
  });
}

/** Carica catalogo DB e valuta regola piega (nessun throw — per uso in createCustomerAppBooking). */
export async function loadAndEvaluateCustomerBookingPiegaRule(
  admin: SupabaseClient,
  serviceIds: number[],
): Promise<EvaluateCustomerBookingPiegaResult> {
  const rows = await fetchCustomerAppServiceCatalogRows(admin, serviceIds);
  const unique = [...new Set(serviceIds)];
  if (rows.length !== unique.length) {
    return {
      ok: false,
      message: "Uno o più servizi non sono stati trovati in anagrafica.",
    };
  }
  return evaluateCustomerBookingPiegaRule(rows);
}
