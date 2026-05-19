import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FISCAL_HEALTH_THRESHOLDS } from "@/lib/fiscal/fiscalHealthConstants";

export type FiscalHealthMetrics = {
  pendingCount: number;
  processingCount: number;
  failedLast24h: number;
  completedLast24h: number;
  oldestPendingAgeMinutes: number | null;
  oldestProcessingAgeMinutes: number | null;
  highAttemptsCount: number;
};

const HIGH_ATTEMPTS_THRESHOLD = FISCAL_HEALTH_THRESHOLDS.highAttempts;

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function ageMinutesFrom(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 60_000));
}

export async function fetchFiscalHealthMetrics(
  salonId: number | null,
): Promise<{ metrics: FiscalHealthMetrics; error: string | null }> {
  const empty: FiscalHealthMetrics = {
    pendingCount: 0,
    processingCount: 0,
    failedLast24h: 0,
    completedLast24h: 0,
    oldestPendingAgeMinutes: null,
    oldestProcessingAgeMinutes: null,
    highAttemptsCount: 0,
  };

  if (salonId === -1) {
    return { metrics: empty, error: null };
  }

  const since24h = isoHoursAgo(24);

  try {
    let qPending = supabaseAdmin
      .from("fiscal_print_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    let qProcessing = supabaseAdmin
      .from("fiscal_print_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing");
    let qFailed = supabaseAdmin
      .from("fiscal_print_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("completed_at", since24h);
    let qCompleted = supabaseAdmin
      .from("fiscal_print_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", since24h);
    let qAttempts = supabaseAdmin
      .from("fiscal_print_jobs")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "processing", "failed"])
      .gte("attempts", HIGH_ATTEMPTS_THRESHOLD);

    if (salonId != null && salonId > 0) {
      qPending = qPending.eq("salon_id", salonId);
      qProcessing = qProcessing.eq("salon_id", salonId);
      qFailed = qFailed.eq("salon_id", salonId);
      qCompleted = qCompleted.eq("salon_id", salonId);
      qAttempts = qAttempts.eq("salon_id", salonId);
    }

    const [
      pendingRes,
      processingRes,
      failedRes,
      completedRes,
      attemptsRes,
      oldestPendingRow,
      oldestProcessingRow,
    ] = await Promise.all([
      qPending,
      qProcessing,
      qFailed,
      qCompleted,
      qAttempts,
      fetchOldestPending(salonId),
      fetchOldestProcessing(salonId),
    ]);

    for (const res of [pendingRes, processingRes, failedRes, completedRes, attemptsRes]) {
      if (res.error) throw res.error;
    }

    return {
      metrics: {
        pendingCount: pendingRes.count ?? 0,
        processingCount: processingRes.count ?? 0,
        failedLast24h: failedRes.count ?? 0,
        completedLast24h: completedRes.count ?? 0,
        oldestPendingAgeMinutes: ageMinutesFrom(
          oldestPendingRow?.created_at ?? null,
        ),
        oldestProcessingAgeMinutes: ageMinutesFrom(
          oldestProcessingRow?.locked_at ??
            oldestProcessingRow?.created_at ??
            null,
        ),
        highAttemptsCount: attemptsRes.count ?? 0,
      },
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore metriche health";
    return { metrics: empty, error: msg };
  }
}

async function fetchOldestPending(
  salonId: number | null,
): Promise<{ created_at: string } | null> {
  if (salonId === -1) return null;

  let q = supabaseAdmin
    .from("fiscal_print_jobs")
    .select("created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (salonId != null && salonId > 0) q = q.eq("salon_id", salonId);

  const { data, error } = await q;
  if (error) throw error;
  return (data?.[0] as { created_at: string } | undefined) ?? null;
}

async function fetchOldestProcessing(
  salonId: number | null,
): Promise<{ locked_at: string | null; created_at: string } | null> {
  if (salonId === -1) return null;

  let q = supabaseAdmin
    .from("fiscal_print_jobs")
    .select("locked_at, created_at")
    .eq("status", "processing")
    .order("locked_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1);

  if (salonId != null && salonId > 0) q = q.eq("salon_id", salonId);

  const { data, error } = await q;
  if (error) throw error;
  return (
    (data?.[0] as { locked_at: string | null; created_at: string } | undefined) ??
    null
  );
}

export { FISCAL_HEALTH_THRESHOLDS } from "@/lib/fiscal/fiscalHealthConstants";
