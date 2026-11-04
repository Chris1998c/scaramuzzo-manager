import type { SupabaseClient } from "@supabase/supabase-js";
import {
  customerMatchesSearch,
  customerSearchIlikeContainsPattern,
  normalizeCustomerSearchApostrophes,
} from "@/lib/customers/customerSearch";

export type ClientiListRow = {
  id: string;
  customer_code: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
};

const BROWSE_LIMIT = 200;
const SEARCH_LIMIT = 100;

const SELECT_COLUMNS =
  "id, customer_code, first_name, last_name, phone, email, address, notes, created_at";

function mapRow(row: Record<string, unknown>): ClientiListRow {
  const code = row.customer_code != null ? String(row.customer_code).trim() : "";
  return {
    id: String(row.id),
    customer_code: code || String(row.id),
    first_name: String(row.first_name ?? ""),
    last_name: String(row.last_name ?? ""),
    phone: String(row.phone ?? ""),
    email: row.email != null ? String(row.email) : null,
    address: row.address != null ? String(row.address) : null,
    notes: row.notes != null ? String(row.notes) : null,
  };
}

function sanitizeIlikeTerm(raw: string): string {
  // Prima togli wildcard LIKE dall'input utente, poi unifica gli apostrofi.
  return normalizeCustomerSearchApostrophes(raw.replace(/[%_,]/g, " ")).trim();
}

function sortByLastName(rows: ClientiListRow[]): ClientiListRow[] {
  return [...rows].sort((a, b) =>
    (a.last_name || "").localeCompare(b.last_name || "", "it", { sensitivity: "base" }),
  );
}

/** True se la ricerca è stata interrotta (AbortSignal o errore di fetch abortito). */
export function isCustomerSearchAborted(
  signal?: AbortSignal | null,
  error?: { message?: string } | null,
): boolean {
  if (signal?.aborted) return true;
  const msg = String(error?.message ?? "");
  if (!msg) return false;
  return /AbortError|The user aborted|signal is aborted|aborted without reason/i.test(msg);
}

function withAbortSignal<T extends { abortSignal: (signal: AbortSignal) => T }>(
  builder: T,
  signal?: AbortSignal,
): T {
  return signal ? builder.abortSignal(signal) : builder;
}

/** Ultimi clienti creati/aggiornati (default lista, no salon filter). */
export async function fetchCustomersBrowse(
  supabase: SupabaseClient,
  limit = BROWSE_LIMIT,
): Promise<{ data: ClientiListRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("customers")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((row) => mapRow(row as Record<string, unknown>)), error: null };
}

export type SearchCustomersOptions = {
  signal?: AbortSignal;
};

/**
 * Ricerca clienti sul server.
 * Query indipendenti (OR broad, telefono, coppie nome/cognome) partono in parallelo.
 * `signal` opzionale: se abortito, ritorna data vuota senza errore.
 */
export async function searchCustomersForClienti(
  supabase: SupabaseClient,
  rawQuery: string,
  limit = SEARCH_LIMIT,
  options?: SearchCustomersOptions,
): Promise<{ data: ClientiListRow[]; error: string | null; aborted?: boolean }> {
  const signal = options?.signal;
  if (signal?.aborted) return { data: [], error: null, aborted: true };

  const q = sanitizeIlikeTerm(rawQuery);
  if (!q) return { data: [], error: null };

  const tokens = q.split(/\s+/).filter(Boolean);
  const merged = new Map<string, ClientiListRow>();

  const addRows = (rows: Record<string, unknown>[] | null) => {
    for (const row of rows ?? []) {
      const mapped = mapRow(row);
      merged.set(mapped.id, mapped);
    }
  };

  const pattern = customerSearchIlikeContainsPattern(q);
  const digits = q.replace(/\D/g, "");

  const tasks: Array<
    PromiseLike<{ data: unknown; error: { message: string } | null }>
  > = [
    withAbortSignal(
      supabase
        .from("customers")
        .select(SELECT_COLUMNS)
        .or(
          `first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`,
        )
        .order("last_name", { ascending: true })
        .limit(limit),
      signal,
    ),
  ];

  if (digits.length >= 4 && digits !== q) {
    tasks.push(
      withAbortSignal(
        supabase
          .from("customers")
          .select(SELECT_COLUMNS)
          .ilike("phone", `%${digits}%`)
          .limit(limit),
        signal,
      ),
    );
  }

  if (tokens.length >= 2) {
    const [a, b] = tokens;
    const pa = customerSearchIlikeContainsPattern(a);
    const pb = customerSearchIlikeContainsPattern(b);

    tasks.push(
      withAbortSignal(
        supabase
          .from("customers")
          .select(SELECT_COLUMNS)
          .ilike("first_name", pa)
          .ilike("last_name", pb)
          .limit(limit),
        signal,
      ),
      withAbortSignal(
        supabase
          .from("customers")
          .select(SELECT_COLUMNS)
          .ilike("first_name", pb)
          .ilike("last_name", pa)
          .limit(limit),
        signal,
      ),
    );
  }

  const results = await Promise.all(tasks);

  if (signal?.aborted) return { data: [], error: null, aborted: true };

  for (const result of results) {
    if (isCustomerSearchAborted(signal, result.error)) {
      return { data: [], error: null, aborted: true };
    }
    if (result.error) return { data: [], error: result.error.message };
    addRows(result.data as Record<string, unknown>[] | null);
  }

  const matched = [...merged.values()].filter((row) =>
    customerMatchesSearch(row, rawQuery),
  );
  return { data: sortByLastName(matched).slice(0, limit), error: null };
}
