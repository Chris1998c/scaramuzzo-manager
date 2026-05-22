/**
 * SaaS foundation — non attivo (single-tenant Scaramuzzo).
 * tenant_id su bridge_installations è nullable fino a introduzione tabella tenants.
 */

export type TenantId = string;

/**
 * Futuro: risolvere tenant da host/subdomain o JWT org.
 * Oggi sempre null → modello 1 azienda / 4 saloni.
 */
export function resolveTenantIdForBridge(_ctx?: {
  host?: string;
  userId?: string;
}): TenantId | null {
  return null;
}

/**
 * Futuro: filtrare bridge_installations per tenant + salon.
 */
export function scopeBridgeQueryByTenant<T extends { tenant_id?: string | null }>(
  rows: T[],
  tenantId: TenantId | null,
): T[] {
  if (!tenantId) return rows;
  return rows.filter((r) => r.tenant_id === tenantId);
}
