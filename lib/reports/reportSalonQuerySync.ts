/**
 * Allinea ?salon_id del Report al selettore globale (ActiveSalon).
 * Ritorna il nuovo salon_id da scrivere, o null se già coerente / non applicabile.
 */
export function nextReportSalonQueryId(
  activeSalonId: number | null | undefined,
  currentQuerySalon: string | null | undefined,
): string | null {
  if (activeSalonId == null || !Number.isFinite(activeSalonId) || activeSalonId <= 0) {
    return null;
  }
  const wanted = String(activeSalonId);
  if (currentQuerySalon === wanted) return null;
  return wanted;
}

/** Preferisci ?salon_id= in URL se valido, altrimenti il salone risolto dal server. */
export function resolveClientReportSalonId(
  querySalon: string | null | undefined,
  serverSalonId: number,
): number {
  const q = Number(querySalon);
  if (Number.isFinite(q) && q > 0) return q;
  return serverSalonId > 0 ? serverSalonId : 0;
}
