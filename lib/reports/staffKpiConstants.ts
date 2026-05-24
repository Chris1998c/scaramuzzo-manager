import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import type { ReportRow } from "@/lib/reports/getSalonTurnover";

/** Bucket virtuale per vendite senza staff_id (non è un collaboratore reale). */
export const UNASSIGNED_STAFF_ID = 0;
export const UNASSIGNED_STAFF_NAME = "Non assegnato";

export function isUnassignedStaffId(staffId: number): boolean {
  return staffId === UNASSIGNED_STAFF_ID;
}

export function resolveRowStaffId(row: ReportRow): number {
  const sid = Number(row.staff_id);
  if (!Number.isFinite(sid) || sid <= 0) return UNASSIGNED_STAFF_ID;
  return sid;
}

export function emptyStaffKpiRow(staffId: number, staffName: string): StaffKpiRow {
  const zeroTriple = {
    real: 0,
    full: 0,
    discount: 0,
    discount_pct: 0,
    avg_ticket_real: 0,
    avg_ticket_full: 0,
    retail: 0,
  };
  return {
    staff_id: staffId,
    staff_name: staffName,
    customers_served: 0,
    customers_with_retail: 0,
    customers_without_retail: 0,
    retail_penetration_pct: null,
    services_qty: 0,
    products_qty: 0,
    receipts_count: 0,
    discounted_receipts_count: 0,
    receipts_without_customer: 0,
    gross: { ...zeroTriple },
    net: { ...zeroTriple },
  };
}

/** Ordina collaboratori reali per incassato; bucket non assegnato sempre in fondo. */
export function sortStaffKpiRows(rows: StaffKpiRow[]): StaffKpiRow[] {
  const unassigned = rows.filter((r) => isUnassignedStaffId(r.staff_id));
  const real = rows
    .filter((r) => !isUnassignedStaffId(r.staff_id))
    .sort((a, b) => b.gross.real - a.gross.real);
  return [...real, ...unassigned];
}

/** Aggiunge staff attivi del salone senza vendite nel periodo (valori zero). */
export function mergeStaffKpiWithSalonStaff(
  rows: StaffKpiRow[],
  salonStaff: Array<{ id: number; name: string }>,
): StaffKpiRow[] {
  const byId = new Map(rows.map((r) => [r.staff_id, r]));

  for (const s of salonStaff) {
    const id = Number(s.id);
    if (!Number.isFinite(id) || id <= 0 || isUnassignedStaffId(id)) continue;
    if (!byId.has(id)) {
      byId.set(id, emptyStaffKpiRow(id, String(s.name ?? `Staff ${id}`)));
    }
  }

  return sortStaffKpiRows([...byId.values()]);
}
