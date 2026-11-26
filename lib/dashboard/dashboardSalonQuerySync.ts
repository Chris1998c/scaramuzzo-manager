/**
 * Allinea ?salon_id della Dashboard al selettore globale (ActiveSalon).
 * Stesso modello del Report: la sede header vince sull’URL.
 */
export function nextDashboardSalonQueryId(
  activeSalonId: number | null | undefined,
  currentQuerySalon: string | null | undefined,
  allowedSalonIds: number[],
): string | null {
  if (
    activeSalonId == null ||
    !Number.isFinite(activeSalonId) ||
    activeSalonId <= 0 ||
    !allowedSalonIds.includes(activeSalonId)
  ) {
    return null;
  }

  const wanted = String(activeSalonId);
  if (currentQuerySalon === wanted) return null;
  return wanted;
}

const DASHBOARD_SALON_SEEDED_HREFS = new Set([
  "/dashboard/report",
  "/dashboard/impostazioni",
  "/dashboard/presenze",
]);

/** Seed ?salon_id= sui link Dashboard che altrimenti aprono senza sede (doppio RSC). */
export function withDashboardSalonHref(
  href: string,
  activeSalonId: number | null | undefined,
): string {
  if (
    activeSalonId == null ||
    !Number.isFinite(activeSalonId) ||
    activeSalonId <= 0 ||
    !DASHBOARD_SALON_SEEDED_HREFS.has(href)
  ) {
    return href;
  }
  return `${href}?salon_id=${activeSalonId}`;
}

/**
 * Sede da usare al clic su Report (e peer) mentre l’URL Dashboard è ancora in sync.
 * `stored` è scritto in sync da setActiveSalonId (localStorage) → vince su context/href SSR stale.
 * Priorità: stored → context → salon_id già nell’href.
 */
export function resolveDashboardLinkNavigationSalonId(args: {
  storedActiveSalonId: number | null | undefined;
  contextActiveSalonId: number | null | undefined;
  hrefSalonId: number | null | undefined;
}): number | null {
  const pick = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) && v > 0 ? v : null;
  return (
    pick(args.storedActiveSalonId) ??
    pick(args.contextActiveSalonId) ??
    pick(args.hrefSalonId)
  );
}

/** Chiave localStorage usata da ActiveSalonProvider.setActiveSalonId. */
export const ACTIVE_SALON_STORAGE_KEY = "sm_activeSalonId";

export function readStoredActiveSalonId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_SALON_STORAGE_KEY);
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
