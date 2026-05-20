/**
 * Match righe CSV Boss → public.customers (telefono, email, nominativo).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getField,
  normalizeEmail,
  normalizeNominativo,
  normalizePhone,
} from "./bossCustomersCsvParse.ts";
import type { BossTechnicalCardsColumnIndices } from "./bossTechnicalCardsClassify.ts";

const PAGE_SIZE = 1000;

export type CustomerIndex = {
  byPhone: Map<string, string[]>;
  byEmail: Map<string, string[]>;
  byNominativo: Map<string, string[]>;
  total: number;
};

export type CustomerMatchResult = {
  id: string | null;
  method: string | null;
  ambiguous: boolean;
};

function addIndex(map: Map<string, string[]>, key: string, id: string): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.includes(id)) list.push(id);
  map.set(key, list);
}

function customerNominativoKey(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.trim().replace(/\s+/g, " ").toUpperCase();
}

export function phoneKeys(raw: string): string[] {
  const keys = new Set<string>();
  const trimmed = raw.trim();
  if (trimmed) keys.add(trimmed);
  const norm = normalizePhone(trimmed);
  if (norm) keys.add(norm);
  return [...keys];
}

export async function loadCustomerIndex(supabase: SupabaseClient): Promise<CustomerIndex> {
  const byPhone = new Map<string, string[]>();
  const byEmail = new Map<string, string[]>();
  const byNominativo = new Map<string, string[]>();
  let offset = 0;
  let total = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Lettura customers: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      total++;
      const id = String(row.id);
      for (const k of phoneKeys(String(row.phone ?? ""))) addIndex(byPhone, k, id);
      const email = normalizeEmail(String(row.email ?? ""));
      if (email) addIndex(byEmail, email, id);
      const key = customerNominativoKey(
        String(row.last_name ?? ""),
        String(row.first_name ?? ""),
      );
      if (key) addIndex(byNominativo, key, id);
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { byPhone, byEmail, byNominativo, total };
}

export function matchCustomerFromBossRow(
  index: CustomerIndex,
  row: string[],
  cols: BossTechnicalCardsColumnIndices,
): CustomerMatchResult {
  const candidates = new Set<string>();
  let method: string | null = null;

  const phones = [
    getField(row, cols.telefono),
    getField(row, cols.cellulare),
    getField(row, cols.altroTelefono),
  ];

  for (const raw of phones) {
    for (const key of phoneKeys(raw)) {
      const ids = index.byPhone.get(key);
      if (!ids?.length) continue;
      for (const id of ids) candidates.add(id);
      if (!method) method = "phone";
    }
  }

  const emails = [getField(row, cols.email), getField(row, cols.altraEmail)];
  for (const raw of emails) {
    const key = normalizeEmail(raw);
    if (!key) continue;
    const ids = index.byEmail.get(key);
    if (!ids?.length) continue;
    for (const id of ids) candidates.add(id);
    if (!method) method = "email";
  }

  const { key: nominativoKey } = normalizeNominativo(getField(row, cols.nominativo));
  if (nominativoKey) {
    const ids = index.byNominativo.get(nominativoKey);
    if (ids?.length) {
      for (const id of ids) candidates.add(id);
      if (!method) method = "nominativo";
    }
  }

  if (candidates.size === 0) return { id: null, method: null, ambiguous: false };
  if (candidates.size > 1) {
    return { id: [...candidates][0]!, method, ambiguous: true };
  }
  return { id: [...candidates][0]!, method, ambiguous: false };
}
