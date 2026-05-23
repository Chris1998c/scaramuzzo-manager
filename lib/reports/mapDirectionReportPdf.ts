import type { DirectionReport } from "@/lib/reports/getDirectionReport";
import { formatRetailPenetrationPct } from "@/lib/reports/retailPenetration";

export type DirectionPdfPayload = {
  salonName: string;
  generatedAt: string;
  incassoOggi: number;
  vsIeriPct: number | null;
  vsIeriAmount: number;
  vsSettimanaPct: number | null;
  vsSettimanaAmount: number;
  meseCorrente: number;
  meseVsPrecPct: number | null;
  scontriniOggi: number;
  scontiOggi: number;
  scontoPctOggi: number;
  retailPctOggi: number | null;
  topStaff: Array<{ name: string; incassato: number; scontoPct: number }>;
  recallCount: number;
  colorAbsentCount: number;
  alerts: Array<{ title: string; count: number; detail: string }>;
};

function money(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function pct(n: number | null): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function mapDirectionReportToPdfPayload(
  report: DirectionReport,
  salonName: string,
): DirectionPdfPayload {
  const today = report.today.money.gross;
  const month = report.month.money.gross;
  const discountPct =
    today.full > 0 ? Math.round((today.discount / today.full) * 1000) / 10 : 0;

  const topStaff = [...report.staffToday]
    .sort((a, b) => b.gross.real - a.gross.real)
    .slice(0, 3)
    .map((s) => ({
      name: s.staff_name,
      incassato: s.gross.real,
      scontoPct: s.gross.discount_pct,
    }));

  let served = 0;
  let withRetail = 0;
  for (const s of report.staffToday) {
    served += s.customers_served;
    withRetail += s.customers_with_retail;
  }
  const retailPct =
    served > 0 ? Math.round((withRetail / served) * 1000) / 10 : null;

  return {
    salonName,
    generatedAt: new Date().toLocaleString("it-IT"),
    incassoOggi: today.real,
    vsIeriPct: report.vsYesterday.pct_gross,
    vsIeriAmount: report.vsYesterday.amount_gross,
    vsSettimanaPct: report.vsLastWeekSameDay.pct_gross,
    vsSettimanaAmount: report.vsLastWeekSameDay.amount_gross,
    meseCorrente: month.real,
    meseVsPrecPct: report.monthComparison.gross_real_pct,
    scontriniOggi: report.today.receipts_count,
    scontiOggi: today.discount,
    scontoPctOggi: discountPct,
    retailPctOggi: retailPct,
    topStaff,
    recallCount: report.crm.notReturned60.length,
    colorAbsentCount: report.crm.colorAbsent.length,
    alerts: report.alerts.map((a) => ({
      title: a.title,
      count: a.count,
      detail: a.detail,
    })),
  };
}

export { money as formatPdfMoney, pct as formatPdfPct, formatRetailPenetrationPct };
