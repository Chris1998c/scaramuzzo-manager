import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";

/** Appiattisce StaffKpiRow per CSV/PDF (evita oggetti nested gross/net). */
export function flattenStaffKpiRow(row: StaffKpiRow) {
  return {
    staff_id: row.staff_id,
    staff_name: row.staff_name,
    customers_served: row.customers_served,
    services_qty: row.services_qty,
    products_qty: row.products_qty,
    receipts_count: row.receipts_count,
    incassato_lordo: row.gross.real,
    valore_listino_lordo: row.gross.full,
    sconti_lordo: row.gross.discount,
    sconto_pct: row.gross.discount_pct,
    scontrino_medio_lordo: row.gross.avg_ticket_real,
    scontrino_listino_lordo: row.gross.avg_ticket_full,
    retail_lordo: row.gross.retail,
    incassato_imponibile: row.net.real,
    valore_listino_imponibile: row.net.full,
    sconti_imponibile: row.net.discount,
    scontrino_medio_imponibile: row.net.avg_ticket_real,
    retail_imponibile: row.net.retail,
  };
}
