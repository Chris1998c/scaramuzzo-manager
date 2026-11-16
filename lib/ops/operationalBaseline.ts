import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

let cached: { ts: string; loadedAt: number } | null = null;
const TTL_MS = 60_000;

/**
 * Wall timestamp (UTC, no tz) matching sales.date / appointments.start_time convention.
 * Pre-baseline rows stay in DB for fiscal trail; operational reads must filter with this.
 */
export async function getOperationalBaselineTs(): Promise<string | null> {
  const now = Date.now();
  if (cached && now - cached.loadedAt < TTL_MS) return cached.ts;

  const { data, error } = await supabaseAdmin
    .from("app_runtime_config")
    .select("operational_baseline_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("[operationalBaseline]", error.message);
    return cached?.ts ?? null;
  }

  const raw = (data as { operational_baseline_at?: string | null } | null)
    ?.operational_baseline_at;
  if (!raw) return cached?.ts ?? null;

  const ts = String(raw).replace("T", " ").replace(/Z$/, "").slice(0, 19);
  cached = { ts, loadedAt: now };
  return ts;
}

/** YYYY-MM-DD (Rome business date of baseline) for agenda day clamps. */
export async function getOperationalBaselineDate(): Promise<string | null> {
  const ts = await getOperationalBaselineTs();
  if (!ts) return null;
  const iso = ts.includes("T") ? `${ts}Z` : `${ts.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return ts.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return ts.slice(0, 10);
  return `${y}-${m}-${day}`;
}
