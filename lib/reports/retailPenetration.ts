/** Retail penetration: clienti con almeno un prodotto / clienti serviti. */

export type RetailPenetrationStats = {
  customers_served: number;
  customers_with_retail: number;
  customers_without_retail: number;
  /** null se non calcolabile (0 clienti serviti). */
  retail_penetration_pct: number | null;
};

export function computeRetailPenetration(
  customersServed: number,
  customersWithRetail: number,
): RetailPenetrationStats {
  const served = Math.max(0, customersServed);
  const withRetail = Math.min(Math.max(0, customersWithRetail), served);
  const without = Math.max(0, served - withRetail);
  const pct = served > 0 ? roundPct((withRetail / served) * 100) : null;

  return {
    customers_served: served,
    customers_with_retail: withRetail,
    customers_without_retail: without,
    retail_penetration_pct: pct,
  };
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatRetailPenetrationPct(pct: number | null): string {
  if (pct == null) return "—";
  return `${pct.toFixed(1)}%`;
}
