import "server-only";

import type { RoleName } from "@/lib/getUserAccess";

/** Modulo Magazzino web: solo staff operativo (escluso profilo cliente). */
export function canAccessMagazzinoWeb(role: RoleName): boolean {
  return role === "coordinator" || role === "reception" || role === "magazzino";
}
