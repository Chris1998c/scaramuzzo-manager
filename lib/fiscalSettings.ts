import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { checkPrintBridgeReachable } from "@/lib/printBridgeHealth";
import type {
  CashSessionFiscalRow,
  FiscalSettingsSnapshot,
  FiscalTodayCounts,
} from "@/lib/fiscalSettingsTypes";

export type {
  CashSessionFiscalRow,
  FiscalSettingsSnapshot,
  FiscalTodayCounts,
} from "@/lib/fiscalSettingsTypes";

/** Giorno corrente in Europe/Rome (YYYY-MM-DD), allineato a /api/cassa/status */
export function todayRomeISO(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function todayRomeBoundsIso(): { start: string; end: string } {
  const day = todayRomeISO();
  return {
    start: `${day}T00:00:00`,
    end: `${day}T23:59:59.999`,
  };
}

/**
 * Conteggi vendite del giorno (Europe/Rome) per `sales.fiscal_status`.
 * Usato in Impostazioni e opzionalmente in GET /api/cassa/status.
 */
export async function fetchFiscalTodayStatusCounts(
  supabase: SupabaseClient,
  salonId: number,
): Promise<FiscalTodayCounts> {
  const { start, end } = todayRomeBoundsIso();
  const { data, error } = await supabase
    .from("sales")
    .select("fiscal_status")
    .eq("salon_id", salonId)
    .gte("date", start)
    .lte("date", end);

  if (error || !Array.isArray(data)) {
    return { by_status: {}, total: 0 };
  }

  const by_status: Record<string, number> = {};
  for (const row of data) {
    const raw = (row as { fiscal_status?: unknown }).fiscal_status;
    const k =
      raw != null ? String(raw).trim() || "pending" : "pending";
    by_status[k] = (by_status[k] ?? 0) + 1;
  }

  return { by_status, total: data.length };
}

export async function fetchFiscalSettingsSnapshot(
  supabase: SupabaseClient,
  salonId: number | null,
): Promise<FiscalSettingsSnapshot | null> {
  if (salonId == null || salonId <= 0) return null;

  const [bridge, salonRes, sessionRes, fiscalToday] = await Promise.all([
    checkPrintBridgeReachable(),
    supabase.from("salons").select("id, name").eq("id", salonId).maybeSingle(),
    supabase
      .from("cash_sessions")
      .select("id, session_date, printer_enabled, opened_at, status")
      .eq("salon_id", salonId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchFiscalTodayStatusCounts(supabase, salonId),
  ]);

  const salon = salonRes.data as { id?: number; name?: string | null } | null;
  const sessionRaw = sessionRes.data as Record<string, unknown> | null;

  let session: CashSessionFiscalRow | null = null;
  if (sessionRaw && sessionRaw.id != null) {
    session = {
      id: Number(sessionRaw.id),
      session_date: String(sessionRaw.session_date ?? ""),
      printer_enabled: Boolean(sessionRaw.printer_enabled),
      opened_at:
        sessionRaw.opened_at != null ? String(sessionRaw.opened_at) : null,
      status: sessionRaw.status != null ? String(sessionRaw.status) : null,
    };
  }

  return {
    salonId,
    salonName: salon?.name != null ? String(salon.name) : null,
    bridge,
    session,
    fiscalToday,
  };
}
