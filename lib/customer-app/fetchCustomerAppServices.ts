import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveServiceDurationSnapshotForBooking } from "@/lib/agenda/agendaContract";

export type CustomerAppServiceDto = {
  id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  /** Durata effettiva di booking (allineata allo snapshot Agenda: max(duration, A+P) se tecnico). */
  duration: number;
  duration_active?: number;
  duration_processing?: number;
  need_processing?: boolean;
  price: number;
  color_code?: string | null;
  /**
   * false = solo companion di composizione (es. Shampoo), non mostrato come scelta autonoma.
   * true/undefined = selezionabile nel catalogo app.
   */
  selectable?: boolean;
};

export type CustomerAppServicesPayload = {
  services: CustomerAppServiceDto[];
  companions: CustomerAppServiceDto[];
};

function parsePrice(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDuration(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function compareCategoryThenName(
  a: CustomerAppServiceDto,
  b: CustomerAppServiceDto,
): number {
  const catA = (a.category_name ?? "").trim().toLocaleLowerCase("it");
  const catB = (b.category_name ?? "").trim().toLocaleLowerCase("it");
  if (catA !== catB) {
    if (!catA) return 1;
    if (!catB) return -1;
    const c = catA.localeCompare(catB, "it");
    if (c !== 0) return c;
  }
  return a.name.localeCompare(b.name, "it");
}

function isShampooCompanionName(name: string, categoryName: string | null): boolean {
  const hay = `${(categoryName ?? "").toLowerCase()} | ${name.toLowerCase()}`
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/shampoo\s*tinta|tinta\s*shampoo/.test(hay)) return false;
  return /shampoo|lavaggio|(^|[^a-z])wash([^a-z]|$)/.test(hay);
}

function mapServiceRow(
  row: Record<string, unknown>,
  salonPrice: number,
  selectable: boolean,
): CustomerAppServiceDto | null {
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) return null;

  const baseDuration = parseDuration(row.duration);
  if (baseDuration === null) return null;

  const snapshot = resolveServiceDurationSnapshotForBooking({
    duration: baseDuration,
    duration_active: row.duration_active,
    duration_processing: row.duration_processing,
    need_processing: row.need_processing,
  });

  const rawCat = row.service_categories as { name?: unknown } | null | undefined;
  const categoryName =
    rawCat?.name != null && String(rawCat.name).trim() !== ""
      ? String(rawCat.name)
      : null;
  const categoryIdRaw = row.category_id;
  const category_id =
    categoryIdRaw != null && Number.isFinite(Number(categoryIdRaw))
      ? Number(categoryIdRaw)
      : null;

  const dto: CustomerAppServiceDto = {
    id,
    name: String(row.name ?? ""),
    category_id,
    category_name: categoryName,
    duration: snapshot.duration_minutes,
    duration_active: snapshot.duration_active,
    duration_processing: snapshot.duration_processing,
    need_processing: snapshot.need_processing,
    price: salonPrice,
    selectable,
  };

  const colorRaw = row.color_code;
  if (colorRaw != null && String(colorRaw).trim() !== "") {
    dto.color_code = String(colorRaw);
  }

  return dto;
}

/**
 * Catalogo servizi prenotabili per salone + companion di composizione (Shampoo).
 * Prezzo solo da service_prices (nessun fallback).
 */
export async function fetchCustomerAppServicesPayload(
  admin: SupabaseClient,
  salonId: number,
): Promise<CustomerAppServicesPayload> {
  const selectCols =
    "id, name, category_id, duration, duration_active, duration_processing, need_processing, color_code, service_categories(name)";

  const { data: visibleRows, error: visErr } = await admin
    .from("services")
    .select(selectCols)
    .eq("active", true)
    .eq("visible_in_customer_app", true);

  if (visErr) {
    throw new Error(`fetchCustomerAppServices(services): ${visErr.message}`);
  }

  const { data: hiddenRows, error: hidErr } = await admin
    .from("services")
    .select(selectCols)
    .eq("active", true)
    .eq("visible_in_customer_app", false);

  if (hidErr) {
    throw new Error(`fetchCustomerAppServices(companions): ${hidErr.message}`);
  }

  const companionCandidates = (hiddenRows ?? []).filter((raw) => {
    const row = raw as Record<string, unknown>;
    const rawCat = row.service_categories as { name?: unknown } | null | undefined;
    const categoryName =
      rawCat?.name != null && String(rawCat.name).trim() !== ""
        ? String(rawCat.name)
        : null;
    return isShampooCompanionName(String(row.name ?? ""), categoryName);
  });

  const allRows = [...(visibleRows ?? []), ...companionCandidates];
  const ids = allRows
    .map((r) => Number((r as { id: unknown }).id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!ids.length) {
    return { services: [], companions: [] };
  }

  const { data: priceRows, error: priceErr } = await admin
    .from("service_prices")
    .select("service_id, price")
    .eq("salon_id", salonId)
    .in("service_id", ids);

  if (priceErr) {
    throw new Error(`fetchCustomerAppServices(prices): ${priceErr.message}`);
  }

  const priceByServiceId = new Map<number, number>();
  for (const pr of priceRows ?? []) {
    const sid = Number((pr as { service_id: unknown }).service_id);
    const price = parsePrice((pr as { price: unknown }).price);
    if (Number.isInteger(sid) && sid > 0 && price !== null) {
      priceByServiceId.set(sid, price);
    }
  }

  const services: CustomerAppServiceDto[] = [];
  for (const raw of visibleRows ?? []) {
    const id = Number((raw as { id: unknown }).id);
    const salonPrice = priceByServiceId.get(id);
    if (salonPrice === undefined) continue;
    const dto = mapServiceRow(raw as Record<string, unknown>, salonPrice, true);
    if (dto) services.push(dto);
  }

  const companions: CustomerAppServiceDto[] = [];
  for (const raw of companionCandidates) {
    const id = Number((raw as { id: unknown }).id);
    const salonPrice = priceByServiceId.get(id);
    if (salonPrice === undefined) continue;
    const dto = mapServiceRow(raw as Record<string, unknown>, salonPrice, false);
    if (dto) companions.push(dto);
  }

  services.sort(compareCategoryThenName);
  companions.sort(compareCategoryThenName);
  return { services, companions };
}

/** Solo catalogo selezionabile (retrocompat test / caller legacy). */
export async function fetchCustomerAppServices(
  admin: SupabaseClient,
  salonId: number,
): Promise<CustomerAppServiceDto[]> {
  const payload = await fetchCustomerAppServicesPayload(admin, salonId);
  return payload.services;
}
