import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCustomersBrowse } from "@/lib/customers/clientiListQuery";
import { filterCustomersBySearch } from "@/lib/customers/customerSearch";
import {
  mapToCustomerPickerRow,
  type CustomerPickerRow,
} from "@/lib/customers/customerPickerUi";

export const CUSTOMER_PRELOAD_MAX = 150;
export const CUSTOMER_VISIBLE_MAX = 8;
export const CUSTOMER_SERVER_DEBOUNCE_MS = 180;
export const CUSTOMER_QUERY_TTL_MS = 5 * 60 * 1000;
export const CUSTOMER_PRELOAD_TTL_MS = 5 * 60 * 1000;

const PICKER_SELECT =
  "id, customer_code, first_name, last_name, phone, email, address, notes, created_at";

type QueryCacheEntry = {
  rows: CustomerPickerRow[];
  expiresAt: number;
};

type PreloadState = {
  pool: CustomerPickerRow[];
  loadedAt: number;
};

/** Chiave stabile per isolamento cache tra saloni. */
export function normalizeSalonCacheKey(salonId?: number | null): string {
  if (salonId != null && Number.isFinite(Number(salonId)) && Number(salonId) > 0) {
    return `salon:${Number(salonId)}`;
  }
  return "salon:global";
}

const preloadBySalon = new Map<string, PreloadState>();
const preloadInFlightBySalon = new Map<string, Promise<CustomerPickerRow[]>>();
const queryResultCacheBySalon = new Map<string, Map<string, QueryCacheEntry>>();

export function customerQueryCacheKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function scopedQueryKey(salonKey: string, rawQuery: string): string {
  return `${salonKey}|${customerQueryCacheKey(rawQuery)}`;
}

function getSalonQueryMap(salonKey: string): Map<string, QueryCacheEntry> {
  let map = queryResultCacheBySalon.get(salonKey);
  if (!map) {
    map = new Map();
    queryResultCacheBySalon.set(salonKey, map);
  }
  return map;
}

export function getPreloadPool(salonId?: number | null): readonly CustomerPickerRow[] {
  const state = preloadBySalon.get(normalizeSalonCacheKey(salonId));
  return state?.pool ?? [];
}

export function isPreloadPoolFresh(salonId?: number | null): boolean {
  const salonKey = normalizeSalonCacheKey(salonId);
  const state = preloadBySalon.get(salonKey);
  if (!state?.pool.length) return false;
  return Date.now() - state.loadedAt < CUSTOMER_PRELOAD_TTL_MS;
}

export function getCachedQueryResults(
  salonId: number | null | undefined,
  rawQuery: string,
): CustomerPickerRow[] | null {
  const salonKey = normalizeSalonCacheKey(salonId);
  const key = scopedQueryKey(salonKey, rawQuery);
  const entry = getSalonQueryMap(salonKey).get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    getSalonQueryMap(salonKey).delete(key);
    return null;
  }
  return entry.rows;
}

export function setCachedQueryResults(
  salonId: number | null | undefined,
  rawQuery: string,
  rows: CustomerPickerRow[],
): void {
  const salonKey = normalizeSalonCacheKey(salonId);
  const key = scopedQueryKey(salonKey, rawQuery);
  getSalonQueryMap(salonKey).set(key, {
    rows: rows.slice(0, CUSTOMER_VISIBLE_MAX),
    expiresAt: Date.now() + CUSTOMER_QUERY_TTL_MS,
  });
}

/** Invalida preload + query cache per un salone (es. cambio ActiveSalon). */
export function invalidateSalonCustomerCaches(salonId?: number | null): void {
  const salonKey = normalizeSalonCacheKey(salonId);
  preloadBySalon.delete(salonKey);
  preloadInFlightBySalon.delete(salonKey);
  queryResultCacheBySalon.delete(salonKey);
}

export function clearCustomerSearchSessionCaches(): void {
  preloadBySalon.clear();
  preloadInFlightBySalon.clear();
  queryResultCacheBySalon.clear();
}

/** Ricerca istantanea sul pool precaricato del salone (nessun debounce). */
export function filterPreloadPool(
  salonId: number | null | undefined,
  rawQuery: string,
  limit = CUSTOMER_VISIBLE_MAX,
): CustomerPickerRow[] {
  const q = String(rawQuery ?? "").trim();
  if (q.length < 2) return [];
  const pool = getPreloadPool(salonId);
  return filterCustomersBySearch([...pool], q).slice(0, limit);
}

/** Server prima, poi locale; dedup per id. */
export function mergeCustomerSearchResults(
  local: CustomerPickerRow[],
  server: CustomerPickerRow[],
  max = CUSTOMER_VISIBLE_MAX,
): CustomerPickerRow[] {
  const out: CustomerPickerRow[] = [];
  const seen = new Set<string>();

  for (const list of [server, local]) {
    for (const row of list) {
      const id = String(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(row);
      if (out.length >= max) return out;
    }
  }
  return out;
}

function mapCustomerRecord(row: Record<string, unknown>): CustomerPickerRow {
  const code = row.customer_code != null ? String(row.customer_code).trim() : "";
  return mapToCustomerPickerRow({
    id: String(row.id),
    customer_code: code || String(row.id),
    first_name: String(row.first_name ?? ""),
    last_name: String(row.last_name ?? ""),
    phone: String(row.phone ?? ""),
    email: row.email != null ? String(row.email) : null,
    address: row.address != null ? String(row.address) : null,
    notes: row.notes != null ? String(row.notes) : null,
  });
}

/**
 * Preload pool per salone: clienti da appuntamenti recenti (priorità), poi ultimi creati.
 */
export async function preloadCustomerSearchPool(
  supabase: SupabaseClient,
  options?: { salonId?: number | null },
): Promise<CustomerPickerRow[]> {
  const salonKey = normalizeSalonCacheKey(options?.salonId);

  if (isPreloadPoolFresh(options?.salonId)) {
    return getPreloadPool(options?.salonId) as CustomerPickerRow[];
  }

  const inFlight = preloadInFlightBySalon.get(salonKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const merged = new Map<string, CustomerPickerRow>();
    const salonId =
      options?.salonId != null && Number.isFinite(Number(options.salonId))
        ? Number(options.salonId)
        : null;

    try {
      let apptQuery = supabase
        .from("appointments")
        .select("customer_id")
        .not("customer_id", "is", null)
        .order("start_time", { ascending: false })
        .limit(280);

      if (salonId != null) {
        apptQuery = apptQuery.eq("salon_id", salonId);
      }

      const { data: appts } = await apptQuery;
      const orderedIds: string[] = [];
      const seenAppt = new Set<string>();
      for (const row of appts ?? []) {
        const id = row.customer_id != null ? String(row.customer_id) : "";
        if (!id || seenAppt.has(id)) continue;
        seenAppt.add(id);
        orderedIds.push(id);
        if (orderedIds.length >= CUSTOMER_PRELOAD_MAX) break;
      }

      if (orderedIds.length > 0) {
        const { data: customerRows } = await supabase
          .from("customers")
          .select(PICKER_SELECT)
          .in("id", orderedIds);

        const byId = new Map<string, CustomerPickerRow>();
        for (const row of customerRows ?? []) {
          const mapped = mapCustomerRecord(row as Record<string, unknown>);
          byId.set(mapped.id, mapped);
        }
        for (const id of orderedIds) {
          const row = byId.get(id);
          if (row) merged.set(id, row);
        }
      }

      if (merged.size < CUSTOMER_PRELOAD_MAX) {
        const { data: browseRows } = await fetchCustomersBrowse(
          supabase,
          CUSTOMER_PRELOAD_MAX - merged.size,
        );
        for (const row of browseRows) {
          if (!merged.has(row.id)) {
            merged.set(row.id, mapToCustomerPickerRow(row));
          }
          if (merged.size >= CUSTOMER_PRELOAD_MAX) break;
        }
      }
    } catch {
      if (merged.size === 0) {
        const { data: browseRows } = await fetchCustomersBrowse(
          supabase,
          CUSTOMER_PRELOAD_MAX,
        );
        for (const row of browseRows) {
          merged.set(row.id, mapToCustomerPickerRow(row));
        }
      }
    }

    const pool = [...merged.values()].slice(0, CUSTOMER_PRELOAD_MAX);
    preloadBySalon.set(salonKey, { pool, loadedAt: Date.now() });
    return pool;
  })();

  preloadInFlightBySalon.set(salonKey, promise);

  try {
    return await promise;
  } finally {
    preloadInFlightBySalon.delete(salonKey);
  }
}
