/**
 * Client-safe helpers for operational baseline (no server-only import).
 */

let cached: { ts: string; loadedAt: number } | null = null;
const TTL_MS = 60_000;

export function normalizeBaselineTs(raw: string): string {
  return String(raw).replace("T", " ").replace(/Z$/, "").slice(0, 19);
}

/** Accepts any Supabase client; avoids brittle PostgREST generics. */
export async function fetchOperationalBaselineTs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
): Promise<string | null> {
  const now = Date.now();
  if (cached && now - cached.loadedAt < TTL_MS) return cached.ts;

  const { data, error } = await supabase
    .from("app_runtime_config")
    .select("operational_baseline_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.warn("[operationalBaselineClient]", error.message);
    return cached?.ts ?? null;
  }
  const raw = data?.operational_baseline_at as string | null | undefined;
  if (!raw) return cached?.ts ?? null;
  const ts = normalizeBaselineTs(raw);
  cached = { ts, loadedAt: now };
  return ts;
}

/** Raise range start to baseline when the requested window is pre-launch. */
export function clampRangeStartToBaseline(
  startRange: string,
  baselineTs: string | null,
): string {
  if (!baselineTs) return startRange;
  return startRange < baselineTs ? baselineTs : startRange;
}
