import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  claimPhonesEquivalent,
  parseClaimPhoneInput,
  type ParseClaimPhoneResult,
} from "@/lib/customerClaim/normalizeClaimPhone";

export type FindCustomersByPhoneResult =
  | { ok: true; customers: { id: string; phone: string }[] }
  | { ok: false; reason: "invalid" | "db_error" };

/**
 * Cerca in `public.customers` per telefono (colonna `phone`).
 * Confronto anche su varianti 389… / 39389… / +39389… senza esporre dati cliente.
 */
export async function findCustomersByClaimPhone(
  phoneRaw: string,
): Promise<FindCustomersByPhoneResult> {
  const parsed = parseClaimPhoneInput(phoneRaw);
  if (!parsed.ok) return { ok: false, reason: "invalid" };

  const merged = await queryCustomersByPhoneKeys(parsed);
  if (merged === null) return { ok: false, reason: "db_error" };

  const byId = new Map<string, { id: string; phone: string }>();
  for (const row of merged) {
    if (claimPhonesEquivalent(row.phone, parsed.canonical)) {
      byId.set(row.id, row);
    }
  }

  return { ok: true, customers: [...byId.values()] };
}

async function queryCustomersByPhoneKeys(
  parsed: Extract<ParseClaimPhoneResult, { ok: true }>,
): Promise<{ id: string; phone: string }[] | null> {
  const seen = new Map<string, { id: string; phone: string }>();

  const { data: exact, error: exactErr } = await supabaseAdmin
    .from("customers")
    .select("id, phone")
    .in("phone", parsed.lookupKeys);

  if (exactErr) return null;

  for (const row of exact ?? []) {
    const id = String(row.id);
    seen.set(id, { id, phone: String(row.phone ?? "") });
  }

  if (seen.size === 0) {
    const suffix = parsed.canonical.slice(-9);
    const { data: fuzzy, error: fuzzyErr } = await supabaseAdmin
      .from("customers")
      .select("id, phone")
      .ilike("phone", `%${suffix}`);

    if (fuzzyErr) return null;

    for (const row of fuzzy ?? []) {
      const id = String(row.id);
      if (!claimPhonesEquivalent(String(row.phone ?? ""), parsed.canonical)) continue;
      seen.set(id, { id, phone: String(row.phone ?? "") });
    }
  }

  return [...seen.values()];
}
