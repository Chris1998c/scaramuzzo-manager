/** Estrae ID servizio/prodotto unici dalle righe vendita timeline (no catalogo completo). */
export function collectTimelineCatalogIds(
  saleItems: Array<{ service_id?: unknown; product_id?: unknown }>,
): { serviceIds: string[]; productIds: string[] } {
  const serviceIds = new Set<string>();
  const productIds = new Set<string>();

  for (const it of saleItems) {
    if (it.service_id != null && String(it.service_id).trim()) {
      serviceIds.add(String(it.service_id));
    }
    if (it.product_id != null && String(it.product_id).trim()) {
      productIds.add(String(it.product_id));
    }
  }

  return {
    serviceIds: [...serviceIds],
    productIds: [...productIds],
  };
}
