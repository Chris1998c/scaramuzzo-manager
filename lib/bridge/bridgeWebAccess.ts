import type { RoleName } from "@/lib/getUserAccess";

import { BRIDGE_SALON_IDS } from "@/lib/bridge/bridgeConstants";

export function canViewBridgeDashboard(role: RoleName): boolean {
  return role === "coordinator" || role === "magazzino" || role === "reception";
}

/** Genera/revoca token e crea installation — solo coordinator. */
export function canManageBridgeTokens(role: RoleName): boolean {
  return role === "coordinator";
}

export function isValidBridgeSalonId(salonId: number): boolean {
  return (BRIDGE_SALON_IDS as readonly number[]).includes(salonId);
}

export function resolveBridgeSalonFilter(
  access: {
    role: RoleName;
    staffSalonId: number | null;
    allowedSalonIds: number[];
  },
  querySalonId: number | null,
): number | null {
  if (access.role === "coordinator" || access.role === "magazzino") {
    if (querySalonId != null && isValidBridgeSalonId(querySalonId)) {
      if (access.role === "magazzino" && !access.allowedSalonIds.includes(querySalonId)) {
        return null;
      }
      return querySalonId;
    }
    return null;
  }
  if (access.role === "reception") {
    const sid = access.staffSalonId ?? access.allowedSalonIds[0] ?? null;
    return sid != null && isValidBridgeSalonId(sid) ? sid : null;
  }
  return null;
}
