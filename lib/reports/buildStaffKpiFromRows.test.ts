import { describe, expect, it } from "vitest";

import { buildStaffKpiFromRows } from "@/lib/reports/buildStaffKpiFromRows";
import type { ReportRow } from "@/lib/reports/getSalonTurnover";

function row(partial: Partial<ReportRow> & Pick<ReportRow, "staff_id">): ReportRow {
  return {
    sale_item_id: 1,
    id: 1,
    sale_id: partial.sale_id ?? 100,
    sale_day: "2026-05-23",
    item_type: partial.item_type ?? "service",
    product_name: null,
    service_name: "Taglio",
    quantity: partial.quantity ?? 1,
    price: partial.price ?? 50,
    line_total_gross: partial.line_total_gross ?? 50,
    line_net: partial.line_net ?? 40.98,
    line_vat: partial.line_vat ?? 9.02,
    item_discount: partial.item_discount ?? 0,
    staff_id: partial.staff_id,
    staff_name: partial.staff_name ?? "Mario",
    payment_method: "card",
    vat_rate: partial.vat_rate ?? 22,
  };
}

describe("buildStaffKpiFromRows", () => {
  it("aggrega per staff con valore pieno e sconti", () => {
    const rows: ReportRow[] = [
      row({
        staff_id: 1,
        sale_id: 100,
        price: 50,
        quantity: 1,
        item_discount: 5,
        line_total_gross: 45,
        line_net: 36.89,
      }),
      row({
        staff_id: 1,
        sale_id: 101,
        item_type: "product",
        price: 20,
        quantity: 2,
        item_discount: 0,
        line_total_gross: 40,
        line_net: 32.79,
      }),
    ];
    const customers = new Map<number, string>([
      [100, "c1"],
      [101, "c2"],
    ]);

    const result = buildStaffKpiFromRows(rows, customers);
    expect(result).toHaveLength(1);
    expect(result[0].staff_name).toBe("Mario");
    expect(result[0].customers_served).toBe(2);
    expect(result[0].customers_with_retail).toBe(1);
    expect(result[0].customers_without_retail).toBe(1);
    expect(result[0].retail_penetration_pct).toBe(50);
    expect(result[0].discounted_receipts_count).toBe(1);
    expect(result[0].services_qty).toBe(1);
    expect(result[0].products_qty).toBe(2);
    expect(result[0].gross.real).toBe(85);
    expect(result[0].gross.full).toBe(90);
    expect(result[0].gross.discount).toBe(5);
    expect(result[0].gross.discount_pct).toBe(5.56);
    expect(result[0].gross.retail).toBe(40);
    expect(result[0].receipts_count).toBe(2);
  });

  it("aggrega righe senza staff_id in Non assegnato", () => {
    const rows: ReportRow[] = [
      row({ staff_id: 0 as unknown as number, line_total_gross: 30, line_net: 24.59 }),
    ];
    const result = buildStaffKpiFromRows(rows, new Map());
    expect(result).toHaveLength(1);
    expect(result[0].staff_id).toBe(0);
    expect(result[0].staff_name).toBe("Non assegnato");
    expect(result[0].gross.real).toBe(30);
  });

  it("segna scontrini senza customer_id", () => {
    const rows: ReportRow[] = [
      row({ staff_id: 2, sale_id: 200, item_discount: 0 }),
    ];
    const result = buildStaffKpiFromRows(rows, new Map());
    expect(result[0].receipts_without_customer).toBe(1);
    expect(result[0].customers_served).toBe(0);
  });
});
