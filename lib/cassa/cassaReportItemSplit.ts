import {
  allocateSaleGlobalDiscount,
  roundMoney2,
} from "@/lib/reports/allocateSaleGlobalDiscount";

export type CassaReportSaleItem = {
  sale_id: number;
  service_id?: number | null;
  product_id?: number | null;
  quantity: number;
  price: number;
  /** Sconto di riga (€), non include lo sconto globale cassa. */
  discount: number;
};

export type CassaReportSaleHeader = {
  id: number;
  /** Incasso reale (sales.total_amount). */
  total_amount: number;
};

export type CassaReportItemSplit = {
  services_gross: number;
  products_gross: number;
  /** Σ line_total dopo ripartizione sconto globale (= Σ total_amount sulle vendite con righe). */
  allocated_gross: number;
};

/**
 * Split servizi/prodotti allineato a report_rows: ripartisce lo sconto globale
 * (Σbasi − total_amount) sulle righe, così services_gross + products_gross = gross.
 */
export function splitCassaReportItemGross(args: {
  sales: CassaReportSaleHeader[];
  items: CassaReportSaleItem[];
}): CassaReportItemSplit {
  const itemsBySale = new Map<number, CassaReportSaleItem[]>();
  for (const it of args.items) {
    const sid = Number(it.sale_id);
    if (!Number.isFinite(sid) || sid <= 0) continue;
    const list = itemsBySale.get(sid) ?? [];
    list.push(it);
    itemsBySale.set(sid, list);
  }

  let services = 0;
  let products = 0;
  let allocated = 0;

  for (const sale of args.sales) {
    const saleId = Number(sale.id);
    const saleItems = itemsBySale.get(saleId) ?? [];
    if (!saleItems.length) continue;

    const allocatedLines = allocateSaleGlobalDiscount({
      lines: saleItems.map((it, i) => ({
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 0,
        lineDiscount: Number(it.discount) || 0,
        lineId: i,
      })),
      saleTotal: Number(sale.total_amount) || 0,
    }).lines;

    for (let i = 0; i < saleItems.length; i++) {
      const it = saleItems[i]!;
      const gross = allocatedLines[i]?.lineTotalGross ?? 0;
      allocated = roundMoney2(allocated + gross);
      if (it.service_id != null) services = roundMoney2(services + gross);
      else if (it.product_id != null) products = roundMoney2(products + gross);
    }
  }

  return {
    services_gross: services,
    products_gross: products,
    allocated_gross: allocated,
  };
}

/** Vecchio split senza sconto globale (solo per test di regressione del drift). */
export function splitCassaReportItemGrossLegacyNoGlobal(args: {
  items: CassaReportSaleItem[];
}): { services_gross: number; products_gross: number } {
  let services = 0;
  let products = 0;
  for (const it of args.items) {
    const qty = Math.max(0, Number(it.quantity) || 0);
    const unit = Number(it.price) || 0;
    const disc = Number(it.discount) || 0;
    const lineTotal = roundMoney2(Math.max(0, unit * qty - disc));
    if (it.service_id != null) services = roundMoney2(services + lineTotal);
    else if (it.product_id != null) products = roundMoney2(products + lineTotal);
  }
  return { services_gross: services, products_gross: products };
}
