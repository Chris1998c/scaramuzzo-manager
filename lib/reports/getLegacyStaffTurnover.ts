import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type LegacyStaffTurnoverRow = {
  id: number;
  salon_id: number;
  period_from: string | null;
  period_to: string | null;
  period_confirmed: boolean;
  boss_name: string;
  boss_code: string;
  staff_id: number | null;
  amount_gross: number;
  services_gross: number;
  products_gross: number;
  match_status: "historical";
  source_batch: string;
  period_note: string;
};

export type LegacyStaffTurnoverBundle = {
  rows: LegacyStaffTurnoverRow[];
  period_from: string | null;
  period_to: string | null;
  period_confirmed: boolean;
  total_gross: number;
  source_batch: string | null;
  period_note: string | null;
};

/**
 * Storico BOSS LAV002 per salone.
 * - period_confirmed=false → storico da verificare (sempre visibile, mai nei totali data).
 * - period_confirmed=true → solo se il filtro date interseca period_from/to.
 * Mai collega staff operativo (staff_id deve restare null).
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
    period_confirmed: false,
    total_gross: 0,
    source_batch: null,
    period_note: null,
  };
  if (!Number.isFinite(salonId) || salonId <= 0) return empty;

  const { data, error } = await supabaseAdmin
    .from("legacy_staff_turnover")
    .select(
      "id, salon_id, period_from, period_to, period_confirmed, boss_name, boss_code, staff_id, amount_gross, services_gross, products_gross, match_status, source_batch, period_note",
    )
    .eq("salon_id", salonId)
    .order("amount_gross", { ascending: false });

  if (error) {
    console.warn("getLegacyStaffTurnover:", error.message);
    return empty;
  }

  const mapped: LegacyStaffTurnoverRow[] = (data ?? []).map((r) => ({
    id: Number(r.id),
    salon_id: Number(r.salon_id),
    period_from: r.period_from == null ? null : String(r.period_from),
    period_to: r.period_to == null ? null : String(r.period_to),
    period_confirmed: !!r.period_confirmed,
    boss_name: String(r.boss_name),
    boss_code: String(r.boss_code),
    staff_id: r.staff_id == null ? null : Number(r.staff_id),
    amount_gross: Number(r.amount_gross) || 0,
    services_gross: Number(r.services_gross) || 0,
    products_gross: Number(r.products_gross) || 0,
    match_status: "historical",
    source_batch: String(r.source_batch),
    period_note: String(r.period_note ?? ""),
  }));

  const rows = mapped.filter((r) => {
    if (!r.period_confirmed) return true;
    if (!r.period_from || !r.period_to) return false;
    return r.period_from <= params.dateTo && r.period_to >= params.dateFrom;
  });

  if (!rows.length) return empty;

  const totalCents = rows.reduce((s, r) => s + Math.round(r.amount_gross * 100), 0);

  return {
    rows,
    period_from: rows[0]?.period_from ?? null,
    period_to: rows[0]?.period_to ?? null,
    period_confirmed: rows.every((r) => r.period_confirmed),
    total_gross: totalCents / 100,
    source_batch: rows[0]?.source_batch ?? null,
    period_note: rows[0]?.period_note ?? null,
  };
}
