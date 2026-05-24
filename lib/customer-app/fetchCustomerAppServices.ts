import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomerAppServiceDto = {
  id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  duration: number;
  price: number;
  color_code?: string | null;
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

/**
 * Catalogo servizi prenotabili per salone. Prezzo solo da service_prices (nessun fallback).
 * Richiede client admin/service_role: RLS service_prices non concede SELECT al ruolo cliente.
 */
export async function fetchCustomerAppServices(
  admin: SupabaseClient,
  salonId: number,
): Promise<CustomerAppServiceDto[]> {
  const { data: serviceRows, error: svcErr } = await admin
    .from("services")
    .select("id, name, category_id, duration, color_code, service_categories(name)")
    .eq("active", true)
    .eq("visible_in_customer_app", true);

  if (svcErr) {
    throw new Error(`fetchCustomerAppServices(services): ${svcErr.message}`);
  }

  const ids = (serviceRows ?? [])
    .map((r) => Number((r as { id: unknown }).id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!ids.length) return [];

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

  const out: CustomerAppServiceDto[] = [];

  for (const row of serviceRows ?? []) {
    const id = Number((row as { id: unknown }).id);
    if (!Number.isInteger(id) || id <= 0) continue;

    const salonPrice = priceByServiceId.get(id);
    if (salonPrice === undefined) continue;

    const duration = parseDuration((row as { duration: unknown }).duration);
    if (duration === null) continue;

    const rawCat = (row as { service_categories?: { name?: unknown } | null })
      .service_categories;
    const categoryName =
      rawCat?.name != null && String(rawCat.name).trim() !== ""
        ? String(rawCat.name)
        : null;
    const categoryIdRaw = (row as { category_id: unknown }).category_id;
    const category_id =
      categoryIdRaw != null && Number.isFinite(Number(categoryIdRaw))
        ? Number(categoryIdRaw)
        : null;

    const colorRaw = (row as { color_code: unknown }).color_code;
    const dto: CustomerAppServiceDto = {
      id,
      name: String((row as { name: unknown }).name ?? ""),
      category_id,
      category_name: categoryName,
      duration,
      price: salonPrice,
    };

    if (colorRaw != null && String(colorRaw).trim() !== "") {
      dto.color_code = String(colorRaw);
    }

    out.push(dto);
  }

  out.sort(compareCategoryThenName);
  return out;
}
