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
