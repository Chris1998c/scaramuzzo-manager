import type { SupabaseClient } from "@supabase/supabase-js";

/** Intervallo minimo tra due timbrature dello stesso collaboratore (anti double-tap / retry). */
export const MOBILE_CLOCK_MIN_INTERVAL_SEC = 15;

export type MobileClockInsertParams = {
  staffId: number;
  salonId: number;
  lat: number;
  lng: number;
  accuracyM: number | null;
  deviceId: string | null;
  appVersion: string | null;
  minIntervalSec?: number;
};

export type MobileClockInsertResult =
  | {
      ok: true;
      newStatus: "in" | "out";
      logId: number;
    }
  | {
      ok: false;
      code: "too_soon" | "rpc_error";
      message: string;
      retryAfterSec?: number;
    };

/**
 * Prossimo stato in/out a partire dall'ultima timbratura (null = prima timbratura → in).
 */
export function nextAttendancePunchType(lastType: string | null | undefined): "in" | "out" {
  return lastType === "in" ? "out" : "in";
}

/**
 * Insert atomico su attendance_logs (advisory lock + anti-duplicato breve).
 * Solo service_role via RPC SECURITY DEFINER.
 */
export async function insertMobileAttendanceClock(
  supabase: SupabaseClient,
  params: MobileClockInsertParams,
): Promise<MobileClockInsertResult> {
  const minInterval =
    params.minIntervalSec != null && Number.isFinite(params.minIntervalSec)
      ? Math.max(0, Math.floor(params.minIntervalSec))
      : MOBILE_CLOCK_MIN_INTERVAL_SEC;

  const { data, error } = await supabase.rpc("mobile_attendance_clock_insert", {
    p_staff_id: params.staffId,
    p_salon_id: params.salonId,
    p_latitude: params.lat,
    p_longitude: params.lng,
    p_accuracy_m: params.accuracyM,
    p_device_id: params.deviceId,
    p_app_version: params.appVersion,
    p_min_interval_seconds: minInterval,
  });

  if (error) {
    const msg = error.message ?? "rpc_error";
    if (/troppo presto|too_soon/i.test(msg)) {
      return { ok: false, code: "too_soon", message: msg, retryAfterSec: minInterval };
    }
    return { ok: false, code: "rpc_error", message: msg };
  }

  const row = data as { new_status?: unknown; log_id?: unknown } | null;
  const status = row?.new_status === "out" ? "out" : row?.new_status === "in" ? "in" : null;
  const logId = Number(row?.log_id);
  if (!status || !Number.isInteger(logId) || logId <= 0) {
    return { ok: false, code: "rpc_error", message: "Risposta clock non valida" };
  }
  return { ok: true, newStatus: status, logId };
}
