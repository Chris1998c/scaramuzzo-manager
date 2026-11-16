export type LegacyDay = { day: string; total_gross: number };

/** Server only. No staff, payment, receipt or VAT detail exists in RIC011. */
export async function fetchLegacyTurnoverDays(salonId: number, from: string, to: string): Promise<LegacyDay[]> {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const rows: LegacyDay[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin
      .from("legacy_turnover_daily")
      .select("day,total_gross")
      .eq("salon_id", salonId)
      .gte("day", from)
      .lte("day", to)
      .order("day")
      .range(offset, offset + 499);
    if (error) throw new Error(`Storico incassi: ${error.message}`);
    const page = (data ?? []) as Array<{ day: string; total_gross: number | string }>;
    rows.push(...page.map((r) => ({ day: r.day, total_gross: Number(r.total_gross) })));
    if (page.length < 500) break;
  }
  return rows;
}

export function combineLegacyTurnover<T extends { sale_day: string | null; line_total_gross: number; sale_id: number | string | null }>(
  liveRows: T[], legacy: LegacyDay[],
) {
  const historicalDays = new Set(legacy.map((r) => r.day));
  const eligibleLive = liveRows.filter((r) => !historicalDays.has(String(r.sale_day)));
  const grossCents = eligibleLive.reduce((sum, r) => sum + Math.round(Number(r.line_total_gross) * 100), 0)
    + legacy.reduce((sum, r) => sum + Math.round(r.total_gross * 100), 0);
  return { eligibleLive, gross_total: grossCents / 100, historicalDays };
}
