import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BossLav002TeamRow } from "@/lib/reports/bossLav002TeamTypes";

export type { BossLav002TeamRow };

/**
 * Nominativi LAV002 del salone per la tabella Team.
 * - period_confirmed=false → sempre in tabella come totale file (mai nei KPI Dal/Al).
 * - period_confirmed=true → solo se period_from/to interseca il filtro (futuro).
 * staff_id ignorato/forzato assente.
 */
export async function getBossLav002TeamRows(params: {
  salonId: number;
  dateFrom: string;
  dateTo: string;
}): Promise<BossLav002TeamRow[]> {
  const salonId = Math.floor(Number(params.salonId));
  if (!Number.isFinite(salonId) || salonId <= 0) return [];

  const { data, error } = await supabaseAdmin
    .from("legacy_staff_turnover")
    .select(
      "id, boss_name, boss_code, amount_gross, period_confirmed, period_from, period_to, staff_id",
    )
    .eq("salon_id", salonId)
    .order("amount_gross", { ascending: false });

  if (error) {
    console.warn("getBossLav002TeamRows:", error.message);
    return [];
  }

  const out: BossLav002TeamRow[] = [];
  for (const r of data ?? []) {
    const confirmed = !!r.period_confirmed;
    if (confirmed) {
      const from = r.period_from == null ? null : String(r.period_from);
      const to = r.period_to == null ? null : String(r.period_to);
      if (!from || !to) continue;
      if (!(from <= params.dateTo && to >= params.dateFrom)) continue;
    }

    out.push({
      id: Number(r.id),
      boss_name: String(r.boss_name),
      boss_code: String(r.boss_code),
      file_amount_gross: Number(r.amount_gross) || 0,
      period_confirmed: confirmed,
    });
  }
  return out;
}

/** @deprecated alias — prefer getBossLav002TeamRows */
export async function getLegacyStaffTurnover(params: {
  salonId: number;
  dateFrom: string;
  dateTo: string;
}): Promise<{ rows: BossLav002TeamRow[] }> {
  return { rows: await getBossLav002TeamRows(params) };
}
