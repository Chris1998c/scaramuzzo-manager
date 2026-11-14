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
  /** Se false, il servizio non è selezionabile dal cliente ma può entrare via composizione. */
  visible_in_customer_app?: boolean;
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

/** Shampoo / lavaggio (non shampoo-tinta). */
export function isCustomerAppShampooService(row: CustomerAppServiceCatalogRow): boolean {
  const hay = haystack(row);
  if (/shampoo\s*tinta|tinta\s*shampoo/.test(hay)) return false;
  return /shampoo|lavaggio|(^|[^a-z])wash([^a-z]|$)/.test(hay);
}

/**
 * Taglio donna / colore / schiariture / tecnico / erbe → richiedono anche shampoo.
 * Allineato alla composizione operativa Agenda (shampoo + servizio + piega).
 */
export function serviceRequiresShampooCompanion(
  row: CustomerAppServiceCatalogRow,
): boolean {
  if (
    isCustomerAppShampooService(row) ||
    isCustomerAppPiegaService(row) ||
    isCustomerAppMensHaircutService(row)
  ) {
    return false;
  }

  const paletteKey = resolveAgendaPaletteKey({
    serviceName: row.name,
    categoryName: row.category_name,
  });

  if (
    paletteKey === "colorazione" ||
    paletteKey === "schiariture" ||
    paletteKey === "taglio"
  ) {
    return true;
  }

  if (isCustomerAppTechnicalService(row)) {
    return true;
  }

  const hay = haystack(row);
  if (/erbe|botanic|henn/.test(hay)) {
    return true;
  }

  return false;
}

function idKey(id: number | string): string {
  return String(id);
}

/**
 * Ordine canonico righe booking: shampoo → servizi principali → piega.
 * Non duplica id già presenti.
 */
export function orderCustomerBookingServiceIds<T extends { id: number }>(
  catalog: T[],
  serviceIds: Array<number | string>,
  isShampoo: (row: T) => boolean,
  isPiega: (row: T) => boolean,
): number[] {
  const byId = new Map(catalog.map((row) => [idKey(row.id), row]));
  const shampoo: number[] = [];
  const middle: number[] = [];
  const piega: number[] = [];
  const seen = new Set<string>();

  for (const rawId of serviceIds) {
    const key = idKey(rawId);
    if (seen.has(key)) continue;
    seen.add(key);
    const n = Number(rawId);
    if (!Number.isInteger(n) || n <= 0) continue;
    const row = byId.get(key);
    if (row && isShampoo(row)) {
      shampoo.push(n);
    } else if (row && isPiega(row)) {
      piega.push(n);
    } else {
      middle.push(n);
    }
  }

  return [...shampoo, ...middle, ...piega];
}

/**
 * Compone il carrello: se manca shampoo/piega obbligatori li inserisce dal catalogo
 * (senza duplicare se già scelti manualmente), poi ordina le righe.
 */
export function composeCustomerBookingServiceIds(
  catalog: CustomerAppServiceCatalogRow[],
  serviceIds: number[],
): number[] {
  const byId = new Map(catalog.map((row) => [idKey(row.id), row]));
  const selected = serviceIds
    .map((id) => byId.get(idKey(id)))
    .filter((row): row is CustomerAppServiceCatalogRow => Boolean(row));

  const needsPiega = selected.some(serviceRequiresPiegaCompanion);
  const needsShampoo = selected.some(serviceRequiresShampooCompanion);

  let next = [...serviceIds];

  if (needsShampoo && !selected.some(isCustomerAppShampooService)) {
    const shampoo = catalog.find(isCustomerAppShampooService);
    if (shampoo) {
      next = [shampoo.id, ...next.filter((id) => idKey(id) !== idKey(shampoo.id))];
    }
  }

  if (needsPiega && !selected.some(isCustomerAppPiegaService)) {
    const piega = catalog.find(isCustomerAppPiegaService);
    if (piega) {
      next = [
        ...next.filter((id) => idKey(id) !== idKey(piega.id)),
        piega.id,
      ];
    }
  }

  return orderCustomerBookingServiceIds(
    catalog,
    next,
    isCustomerAppShampooService,
    isCustomerAppPiegaService,
  );
}

function mapCatalogRow(raw: {
  id: unknown;
  name: unknown;
  need_processing?: unknown;
  visible_in_customer_app?: unknown;
  service_categories?: { name?: unknown } | null;
}): CustomerAppServiceCatalogRow {
  const cat = raw.service_categories;
  const category_name =
    cat?.name != null && String(cat.name).trim() !== "" ? String(cat.name) : null;
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    category_name,
    need_processing: raw.need_processing === true,
    visible_in_customer_app: raw.visible_in_customer_app === true,
  };
}

/**
 * Catalogo per composizione: servizi visible + companion shampoo attivi non visible.
 * Piega resta nel catalogo visible; shampoo entra solo come companion.
 */
export async function fetchCustomerAppCompositionCatalog(
  admin: SupabaseClient,
): Promise<CustomerAppServiceCatalogRow[]> {
  const { data: visible, error: visErr } = await admin
    .from("services")
    .select("id, name, need_processing, visible_in_customer_app, service_categories(name)")
    .eq("active", true)
    .eq("visible_in_customer_app", true);

  if (visErr) {
    throw new Error(`composition catalog(visible): ${visErr.message}`);
  }

  const { data: hidden, error: hidErr } = await admin
    .from("services")
    .select("id, name, need_processing, visible_in_customer_app, service_categories(name)")
    .eq("active", true)
    .eq("visible_in_customer_app", false);

  if (hidErr) {
    throw new Error(`composition catalog(hidden): ${hidErr.message}`);
  }

  const rows = [
    ...(visible ?? []).map((r) => mapCatalogRow(r as Parameters<typeof mapCatalogRow>[0])),
    ...(hidden ?? [])
      .map((r) => mapCatalogRow(r as Parameters<typeof mapCatalogRow>[0]))
      .filter(isCustomerAppShampooService),
  ];

  const byId = new Map<number, CustomerAppServiceCatalogRow>();
  for (const row of rows) {
    if (Number.isInteger(row.id) && row.id > 0) byId.set(row.id, row);
  }
  return [...byId.values()];
}

/** @deprecated alias — usare fetchCustomerAppCompositionCatalog */
export async function fetchCustomerAppBookableCatalog(
  admin: SupabaseClient,
): Promise<CustomerAppServiceCatalogRow[]> {
  return fetchCustomerAppCompositionCatalog(admin);
}

export type NormalizeCustomerAppBookingServiceIdsResult =
  | {
      ok: true;
      serviceIds: number[];
      /** Companion non selezionabili (es. Shampoo) aggiunti dalla compose. */
      companionIds: number[];
    }
  | { ok: false; message: string };

/**
 * Normalizza gli ID client in composizione canonica.
 * Seed = solo servizi `visible_in_customer_app` (Piega ok; Shampoo no).
 * I companion non visible (Shampoo) si aggiungono solo via compose, senza doppioni.
 * Shampoo da solo → rifiuto.
 */
export function normalizeCustomerAppBookingServiceIds(
  catalog: CustomerAppServiceCatalogRow[],
  inputServiceIds: number[],
): NormalizeCustomerAppBookingServiceIdsResult {
  const byId = new Map(catalog.map((row) => [row.id, row]));

  for (const id of inputServiceIds) {
    if (!byId.has(id)) {
      return { ok: false, message: `Servizio non prenotabile dall'app (id ${id}).` };
    }
  }

  const seedIds = inputServiceIds.filter(
    (id) => byId.get(id)?.visible_in_customer_app === true,
  );

  if (!seedIds.length) {
    return {
      ok: false,
      message: "Seleziona almeno un servizio dal catalogo.",
    };
  }

  const composed = composeCustomerBookingServiceIds(catalog, seedIds);

  if (new Set(composed).size !== composed.length) {
    return { ok: false, message: "Elenco servizi non valido (duplicati)." };
  }

  for (const id of composed) {
    if (!byId.has(id)) {
      return { ok: false, message: `Servizio non prenotabile dall'app (id ${id}).` };
    }
  }

  const companionIds = composed.filter(
    (id) => byId.get(id)?.visible_in_customer_app !== true,
  );

  return { ok: true, serviceIds: composed, companionIds };
}

/**
 * Allowlist per `resolveAgendaServiceLines`: solo companion della composizione
 * (non selezionabili in app) possono saltare `visible_in_agenda`.
 */
export function agendaVisibilityBypassIdsForCustomerComposition(
  result: Extract<NormalizeCustomerAppBookingServiceIdsResult, { ok: true }>,
): ReadonlySet<number> {
  return new Set(result.companionIds);
}
