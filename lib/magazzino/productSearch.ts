/** Clausola PostgREST `.or()` per ricerca nome o barcode (senza virgole nel termine). */
export function productSearchOrClause(term: string): string | null {
  const s = term.trim().replace(/,/g, " ").trim();
  if (!s) return null;
  return `name.ilike.%${s}%,barcode.ilike.%${s}%`;
}

/** Applica filtro nome/barcode a una query Supabase se il termine non è vuoto. */
export function applyProductSearchOr<T extends { or: (filters: string) => T }>(
  query: T,
  term: string,
): T {
  const clause = productSearchOrClause(term);
  if (!clause) return query;
  return query.or(clause);
}
