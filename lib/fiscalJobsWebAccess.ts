import "server-only";

import type { getUserAccess } from "@/lib/getUserAccess";
import { canAccessFiscalJobsWeb } from "@/lib/fiscalJobsWebAccessShared";

export { canAccessFiscalJobsWeb };

/**
 * null = nessun filtro salone (coordinator, magazzino).
 * [] = nessun dato (reception senza salone operativo).
 * [id] = reception: solo staffSalonId.
 */
export function salonIdsForFiscalJobsFilter(
  access: Awaited<ReturnType<typeof getUserAccess>>,
): number[] | null {
  if (access.role === "coordinator" || access.role === "magazzino") {
    return null;
  }
  if (access.role === "reception") {
    const sid = access.staffSalonId;
    if (sid != null && Number.isFinite(sid) && sid > 0) return [sid];
    return [];
  }
  return [];
}

/** Filtro salone in URL: coordinator e magazzino. */
export function canPickSalonFilterOnFiscalJobs(
  role: Awaited<ReturnType<typeof getUserAccess>>["role"],
): boolean {
  return role === "coordinator" || role === "magazzino";
}

export function resolveSalonIdFilter(
  access: Awaited<ReturnType<typeof getUserAccess>>,
  querySalonId: number | null,
): number | null {
  const base = salonIdsForFiscalJobsFilter(access);
  if (base !== null) {
    if (base.length === 0) return -1;
    return base[0] ?? null;
  }
  if (querySalonId == null || querySalonId <= 0) return null;
  if (access.role === "magazzino") {
    if (!access.allowedSalonIds.includes(querySalonId)) return null;
  }
  return querySalonId;
}
