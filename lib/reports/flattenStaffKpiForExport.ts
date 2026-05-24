import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";
import { reportVatModeLabel } from "@/lib/reports/reportVatMode";

/** Righe Team CSV con intestazioni italiane e colonne piatte (export enterprise). */
export function flattenStaffKpiRowItalian(row: StaffKpiRow, vatMode: VatDisplayMode = "gross") {
  const m = pickStaffMoney(row, vatMode);
  return {
    Visualizzazione: reportVatModeLabel(vatMode),
    Collaboratore: row.staff_name,
    Incassato: m.real,
    "Valore a listino": m.full,
    "Sconti dati": m.discount,
    "Sconto %": m.discount_pct,
    "Clienti serviti": row.customers_served,
    "Retail venduto": m.retail,
    "Retail %": row.retail_penetration_pct,
    "Scontrino medio": m.avg_ticket_real,
    "Scontrini scontati": row.discounted_receipts_count,
  };
}

/** Appiattisce StaffKpiRow per CSV/PDF (evita oggetti nested gross/net). */
export function flattenStaffKpiRow(row: StaffKpiRow) {
  return {
    staff_id: row.staff_id,
    staff_name: row.staff_name,
    customers_served: row.customers_served,
    customers_with_retail: row.customers_with_retail,
    customers_without_retail: row.customers_without_retail,
    retail_penetration_pct: row.retail_penetration_pct,
    services_qty: row.services_qty,
    products_qty: row.products_qty,
    receipts_count: row.receipts_count,
    scontrini_scontati: row.discounted_receipts_count,
    scontrini_senza_cliente: row.receipts_without_customer,
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
