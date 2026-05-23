import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";

export const HIGH_DISCOUNT_PCT = 15;
/** Scontrino medio sotto il 75% della media team. */
export const LOW_TICKET_RATIO = 0.75;
export const MIN_RECEIPTS_FOR_LOW_TICKET = 3;

export type StaffAlertBadge = "high_discount" | "low_retail" | "low_ticket";

export type StaffAlertBadgeMeta = {
  id: StaffAlertBadge;
  label: string;
  className: string;
};

export const STAFF_ALERT_BADGE_META: Record<StaffAlertBadge, StaffAlertBadgeMeta> = {
  high_discount: {
    id: "high_discount",
    label: "Sconto alto",
    className: "bg-amber-500/20 text-amber-200",
  },
  low_retail: {
    id: "low_retail",
    label: "Retail basso",
    className: "bg-white/10 text-white/50",
  },
  low_ticket: {
    id: "low_ticket",
    label: "Scontrino basso",
    className: "bg-red-500/15 text-red-300",
  },
};

/** Media team del scontrino medio (ponderata per numero scontrini). */
export function computeTeamAvgTicket(
  rows: StaffKpiRow[],
  mode: VatDisplayMode = "gross",
): number {
  let totalReal = 0;
  let totalReceipts = 0;
  for (const r of rows) {
    const m = pickStaffMoney(r, mode);
    totalReal += m.real;
    totalReceipts += r.receipts_count;
  }
  return totalReceipts > 0 ? totalReal / totalReceipts : 0;
}

export function computeStaffAlertBadges(
  row: StaffKpiRow,
  teamAvgTicket: number,
  mode: VatDisplayMode = "gross",
): StaffAlertBadge[] {
  const m = pickStaffMoney(row, mode);
  const badges: StaffAlertBadge[] = [];

  if (m.discount_pct >= HIGH_DISCOUNT_PCT) {
    badges.push("high_discount");
  }

  if (m.real > 0 && m.retail === 0 && row.services_qty >= 2) {
    badges.push("low_retail");
  }

  if (
    row.receipts_count >= MIN_RECEIPTS_FOR_LOW_TICKET &&
    teamAvgTicket > 0 &&
    m.avg_ticket_real < teamAvgTicket * LOW_TICKET_RATIO
  ) {
    badges.push("low_ticket");
  }

  return badges;
}
