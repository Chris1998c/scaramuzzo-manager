export type LegacyDay = { day: string; total_gross: number };
export type LegacyOverview = {
  firstDay: string;
  lastDay: string;
  days: number;
  totalGross: number;
  years: Array<{ year: number; days: number; totalGross: number }>;
};

export function summarizeLegacyTurnover(rows: LegacyDay[]): LegacyOverview | null {
  if (!rows.length) return null;
  const ordered = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const years = new Map<number, { days: number; cents: number }>();
  let cents = 0;
  for (const row of ordered) {
    const value = Math.round(row.total_gross * 100);
    cents += value;
    const year = Number(row.day.slice(0, 4));
    const tally = years.get(year) ?? { days: 0, cents: 0 };
    tally.days += 1;
    tally.cents += value;
    years.set(year, tally);
  }
  return {
    firstDay: ordered[0].day,
    lastDay: ordered[ordered.length - 1].day,
    days: ordered.length,
    totalGross: cents / 100,
    years: [...years].map(([year, value]) => ({ year, days: value.days, totalGross: value.cents / 100 })),
  };
}

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
