import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type LegacyStaffTurnoverRow = {
  id: number;
  salon_id: number;
  period_from: string;
  period_to: string;
  boss_name: string;
  boss_code: string;
  staff_id: number | null;
  amount_gross: number;
  services_gross: number;
  products_gross: number;
  match_status: "matched_active" | "matched_inactive" | "unmatched";
  source_batch: string;
  period_note: string;
  staff_name: string | null;
  staff_active: boolean | null;
};

export type LegacyStaffTurnoverBundle = {
  rows: LegacyStaffTurnoverRow[];
  period_from: string | null;
  period_to: string | null;
  total_gross: number;
  attributed_matched_gross: number;
  unmatched_gross: number;
  source_batch: string | null;
  period_note: string | null;
};

/**
 * Storico BOSS LAV002 per salone, se il periodo filtri interseca il periodo importato.
 * Non mescola i totali nelle vendite live.
 */
export async function getLegacyStaffTurnover(params: {
  salonId: number;
  dateFrom: string;
  dateTo: string;
}): Promise<LegacyStaffTurnoverBundle> {
  const salonId = Math.floor(Number(params.salonId));
  const empty: LegacyStaffTurnoverBundle = {
    rows: [],
    period_from: null,
    period_to: null,
    total_gross: 0,
    attributed_matched_gross: 0,
    unmatched_gross: 0,
    source_batch: null,
    period_note: null,
  };
  if (!Number.isFinite(salonId) || salonId <= 0) return empty;

  const { data, error } = await supabaseAdmin
    .from("legacy_staff_turnover")
    .select(
      "id, salon_id, period_from, period_to, boss_name, boss_code, staff_id, amount_gross, services_gross, products_gross, match_status, source_batch, period_note, staff:staff_id(name, active)",
    )
    .eq("salon_id", salonId)
    .lte("period_from", params.dateTo)
    .gte("period_to", params.dateFrom)
    .order("amount_gross", { ascending: false });

  if (error) {
    console.warn("getLegacyStaffTurnover:", error.message);
    return empty;
  }

  const rows: LegacyStaffTurnoverRow[] = (data ?? []).map((r) => {
    const staffJoin = r.staff as { name?: string; active?: boolean } | null;
    return {
      id: Number(r.id),
      salon_id: Number(r.salon_id),
      period_from: String(r.period_from),
      period_to: String(r.period_to),
      boss_name: String(r.boss_name),
      boss_code: String(r.boss_code),
      staff_id: r.staff_id == null ? null : Number(r.staff_id),
      amount_gross: Number(r.amount_gross) || 0,
      services_gross: Number(r.services_gross) || 0,
      products_gross: Number(r.products_gross) || 0,
      match_status: r.match_status as LegacyStaffTurnoverRow["match_status"],
      source_batch: String(r.source_batch),
      period_note: String(r.period_note ?? ""),
      staff_name: staffJoin?.name != null ? String(staffJoin.name) : null,
      staff_active: staffJoin?.active == null ? null : !!staffJoin.active,
    };
  });

  if (!rows.length) return empty;

  const total = rows.reduce((s, r) => s + r.amount_gross, 0);
  const unmatched = rows
    .filter((r) => r.match_status === "unmatched")
    .reduce((s, r) => s + r.amount_gross, 0);
  const matched = total - unmatched;

  return {
    rows,
    period_from: rows[0]?.period_from ?? null,
    period_to: rows[0]?.period_to ?? null,
    total_gross: Math.round(total * 100) / 100,
    attributed_matched_gross: Math.round(matched * 100) / 100,
    unmatched_gross: Math.round(unmatched * 100) / 100,
    source_batch: rows[0]?.source_batch ?? null,
    period_note: rows[0]?.period_note ?? null,
  };
}
