export type MobileLoginStaffRow = {
  active?: boolean | null;
  mobile_enabled?: boolean | null;
  mobile_pin_hash?: string | null;
};

export type MobileLoginGuardResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: string };

/** Controlli staff prima del confronto PIN (ordine: attivo → mobile → PIN configurato). */
export function assertStaffEligibleForMobileLogin(staff: MobileLoginStaffRow): MobileLoginGuardResult {
  if (!staff.active) {
    return {
      ok: false,
      status: 403,
      error: "Collaboratore non attivo. Contatta il coordinatore.",
    };
  }
  if (!staff.mobile_enabled) {
    return {
      ok: false,
      status: 403,
      error: "Mobile access disabled",
    };
  }
  if (!staff.mobile_pin_hash) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }
  return { ok: true };
}
