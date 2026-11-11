import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStaffSalonIds } from "@/lib/mobile/mobileStaffSalons";
import {
  resolveMobileSalonIdFromBody,
  type VerifiedMobileToken,
} from "@/lib/mobileSession";

/**
 * Gate live per route Team App: a ogni richiesta rilegge staff.active,
 * mobile_enabled e staff_salons (+ primario). Il JWT da solo non basta
 * dopo disattivazione / revoca mobile / rimozione sede.
 */

export type MobileLiveStaffOk = {
  ok: true;
  staffId: number;
  primarySalonId: number | null;
  liveSalonIds: number[];
};

export type MobileLiveStaffFail = {
  ok: false;
  reason: "not_found" | "inactive" | "mobile_disabled" | "db_error";
  message?: string;
};

export async function loadMobileLiveStaff(
  admin: SupabaseClient,
  staffId: number,
): Promise<MobileLiveStaffOk | MobileLiveStaffFail> {
  const { data, error } = await admin
    .from("staff")
    .select("id, salon_id, active, mobile_enabled")
    .eq("id", staffId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "db_error", message: error.message };
  }
  if (!data) {
    return { ok: false, reason: "not_found" };
  }
  if (!data.active) {
    return { ok: false, reason: "inactive" };
  }
  if (!data.mobile_enabled) {
    return { ok: false, reason: "mobile_disabled" };
  }

  const primarySalonId =
    data.salon_id != null &&
    Number.isInteger(Number(data.salon_id)) &&
    Number(data.salon_id) > 0
      ? Number(data.salon_id)
      : null;

  const liveSalonIds = await resolveStaffSalonIds(admin, staffId, primarySalonId);

  return {
    ok: true,
    staffId: Number(data.id),
    primarySalonId,
    liveSalonIds,
  };
}

/**
 * Salone effettivo: intersezione JWT ∩ assegnazioni live.
 * Una sede revocata da staff_salons resta nel token fino a re-login, ma viene rifiutata qui.
 */
export function resolveLiveMobileSalonId(
  bodySalonId: unknown,
  token: VerifiedMobileToken,
  liveSalonIds: number[],
): number | null {
  const candidate = resolveMobileSalonIdFromBody(bodySalonId, token);
  if (candidate == null) return null;
  if (!liveSalonIds.includes(candidate)) return null;
  return candidate;
}

/**
 * Saloni usabili per geofence clock: preferisci JWT ∩ live;
 * se l'intersezione è vuota (assegnazioni cambiate) usa solo live DB.
 * Mai saloni presenti solo nel JWT e non più assegnati.
 */
export function clockSalonIdsFromLiveAndToken(
  token: VerifiedMobileToken,
  liveSalonIds: number[],
): number[] {
  if (!liveSalonIds.length) return [];
  const live = new Set(liveSalonIds);
  const intersection = token.salon_ids.filter((id) => live.has(id));
  return intersection.length ? intersection : liveSalonIds;
}
