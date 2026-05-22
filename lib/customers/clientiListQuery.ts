import type { SupabaseClient } from "@supabase/supabase-js";
import { customerMatchesSearch } from "@/lib/customers/customerSearch";

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
  return raw.replace(/[%_,]/g, " ").trim();
}

function sortByLastName(rows: ClientiListRow[]): ClientiListRow[] {
  return [...rows].sort((a, b) =>
    (a.last_name || "").localeCompare(b.last_name || "", "it", { sensitivity: "base" }),
  );
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

export async function searchCustomersForClienti(
  supabase: SupabaseClient,
  rawQuery: string,
  limit = SEARCH_LIMIT,
): Promise<{ data: ClientiListRow[]; error: string | null }> {
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

  const pattern = `%${q}%`;
  const { data: broad, error: broadError } = await supabase
    .from("customers")
    .select(SELECT_COLUMNS)
    .or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`,
    )
    .order("last_name", { ascending: true })
    .limit(limit);

  if (broadError) return { data: [], error: broadError.message };
  addRows(broad as Record<string, unknown>[] | null);

  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4 && digits !== q) {
    const { data: phoneRows, error: phoneError } = await supabase
      .from("customers")
      .select(SELECT_COLUMNS)
      .ilike("phone", `%${digits}%`)
      .limit(limit);

    if (phoneError) return { data: [], error: phoneError.message };
    addRows(phoneRows as Record<string, unknown>[] | null);
  }

  if (tokens.length >= 2) {
    const [a, b] = tokens;
    const pa = `%${a}%`;
    const pb = `%${b}%`;

    const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
      supabase
        .from("customers")
        .select(SELECT_COLUMNS)
        .ilike("first_name", pa)
        .ilike("last_name", pb)
        .limit(limit),
      supabase
        .from("customers")
        .select(SELECT_COLUMNS)
        .ilike("first_name", pb)
        .ilike("last_name", pa)
        .limit(limit),
    ]);

    if (e1) return { data: [], error: e1.message };
    if (e2) return { data: [], error: e2.message };
    addRows(d1 as Record<string, unknown>[] | null);
    addRows(d2 as Record<string, unknown>[] | null);
  }

  const matched = [...merged.values()].filter((row) =>
    customerMatchesSearch(row, rawQuery),
  );
  return { data: sortByLastName(matched).slice(0, limit), error: null };
}
