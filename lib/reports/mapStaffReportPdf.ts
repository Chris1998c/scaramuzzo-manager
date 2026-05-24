import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import { buildStaffDrillDown } from "@/lib/reports/buildStaffDrillDown";
import { buildStaffTeamSummary } from "@/lib/reports/buildStaffTeamSummary";
import type { ReportRow } from "@/lib/reports/getSalonTurnover";
import {
  computeStaffAlertBadges,
  computeTeamAvgTicket,
  STAFF_ALERT_BADGE_META,
  type StaffAlertBadge,
} from "@/lib/reports/staffKpiAlerts";

export type TeamPdfStaffBlock = {
  rank: number;
  staff_id: number;
  staff_name: string;
  incassato: number;
  listino: number;
  sconti: number;
  sconto_pct: number;
  ticket_medio: number;
  retail_eur: number;
  retail_pct: number | null;
  clienti_serviti: number;
  topServices: Array<{ name: string; quantity: number; gross: number }>;
  topProducts: Array<{ name: string; quantity: number; gross: number }>;
  badges: Array<{ id: StaffAlertBadge; label: string }>;
  discounted_receipts: number;
  total_receipts: number;
};

export type TeamPdfPayload = {
  salonName: string;
  salonId: number;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  summary: {
    incasso: number;
    listino: number;
    sconti: number;
    retail_pct: number | null;
    avg_ticket: number;
    staff_count: number;
  };
  staff: TeamPdfStaffBlock[];
};

export function mapStaffReportToPdfPayload(input: {
  salonName: string;
  salonId: number;
  dateFrom: string;
  dateTo: string;
  staffPerformance: StaffKpiRow[];
  rows: ReportRow[];
  customerBySaleId?: Record<string, string>;
}): TeamPdfPayload {
  const customerBySaleId = input.customerBySaleId ?? {};
  const teamSummary = buildStaffTeamSummary(input.staffPerformance, "gross");
  const teamAvgTicket = computeTeamAvgTicket(input.staffPerformance, "gross");

  const staff: TeamPdfStaffBlock[] = input.staffPerformance.map((row, idx) => {
    const m = pickStaffMoney(row, "gross");
    const drill = buildStaffDrillDown({
      staffId: row.staff_id,
      rows: input.rows,
      customerBySaleId,
      current: row,
      vatMode: "gross",
    });
    const badgeIds = computeStaffAlertBadges(row, teamAvgTicket, "gross");

    return {
      rank: idx + 1,
      staff_id: row.staff_id,
      staff_name: row.staff_name,
      incassato: m.real,
      listino: m.full,
      sconti: m.discount,
      sconto_pct: m.discount_pct,
      ticket_medio: m.avg_ticket_real,
      retail_eur: m.retail,
      retail_pct: row.retail_penetration_pct,
      clienti_serviti: row.customers_served,
      topServices: drill.topServices,
      topProducts: drill.topProducts,
      badges: badgeIds.map((id) => ({
        id,
        label: STAFF_ALERT_BADGE_META[id].label,
      })),
      discounted_receipts: drill.discountedReceipts,
      total_receipts: drill.totalReceipts,
    };
  });

  return {
    salonName: input.salonName,
    salonId: input.salonId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt: new Date().toLocaleString("it-IT"),
    summary: {
      incasso: teamSummary.incasso,
      listino: teamSummary.listino,
      sconti: teamSummary.sconti,
      retail_pct: teamSummary.retail_penetration_pct,
      avg_ticket: teamSummary.avg_ticket,
      staff_count: teamSummary.staff_count,
    },
    staff,
  };
}
