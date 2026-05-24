import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";
import { computeRetailPenetration } from "@/lib/reports/retailPenetration";
import { computeTeamAvgTicket } from "@/lib/reports/staffKpiAlerts";

export type StaffTeamHighlight = {
  staff_id: number;
  staff_name: string;
  value: number;
  label: string;
};

export type StaffTeamSummary = {
  incasso: number;
  listino: number;
  sconti: number;
  retail_penetration_pct: number | null;
  avg_ticket: number;
  staff_count: number;
  best_performer: StaffTeamHighlight | null;
  highest_discount: StaffTeamHighlight | null;
  lowest_retail: StaffTeamHighlight | null;
};

export function buildStaffTeamSummary(
  rows: StaffKpiRow[],
  mode: VatDisplayMode = "gross",
): StaffTeamSummary {
  let incasso = 0;
  let listino = 0;
  let sconti = 0;
  let served = 0;
  let withRetail = 0;

  for (const r of rows) {
    const m = pickStaffMoney(r, mode);
    incasso += m.real;
    listino += m.full;
    sconti += m.discount;
    served += r.customers_served;
    withRetail += r.customers_with_retail;
  }

  const penetration = computeRetailPenetration(served, withRetail);

  const best = rows[0]
    ? {
        staff_id: rows[0].staff_id,
        staff_name: rows[0].staff_name,
        value: pickStaffMoney(rows[0], mode).real,
        label: "Incassato",
      }
    : null;

  let highestDiscount: StaffTeamHighlight | null = null;
  for (const r of rows) {
    if (r.receipts_count === 0) continue;
    const pct = pickStaffMoney(r, mode).discount_pct;
    if (!highestDiscount || pct > highestDiscount.value) {
      highestDiscount = {
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        value: pct,
        label: "Sconto %",
      };
    }
  }

  let lowestRetail: StaffTeamHighlight | null = null;
  for (const r of rows) {
    if (r.customers_served < 2) continue;
    const pct = r.retail_penetration_pct ?? 0;
    if (!lowestRetail || pct < lowestRetail.value) {
      lowestRetail = {
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        value: pct,
        label: "Retail %",
      };
    }
  }

  return {
    incasso,
    listino,
    sconti,
    retail_penetration_pct: penetration.retail_penetration_pct,
    avg_ticket: computeTeamAvgTicket(rows, mode),
    staff_count: rows.length,
    best_performer: best,
    highest_discount: highestDiscount,
    lowest_retail: lowestRetail,
  };
}
