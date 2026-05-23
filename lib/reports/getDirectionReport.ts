import { getSalonTurnover } from "@/lib/reports/getSalonTurnover";
import {
  aggregateMoneyTriples,
  avgTicket,
  pctChange,
  roundMoney,
  type MoneyTriple,
  type ReportLineInput,
} from "@/lib/reports/reportLineKpiMath";
import { fetchCustomerIdsForRows } from "@/lib/reports/reportSaleCustomers";
import {
  getDirectionCrmActions,
  type DirectionCrmActions,
} from "@/lib/reports/getDirectionCrmActions";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function shiftPeriod(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const diff = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - diff);
  return {
    prevFrom: prevFrom.toISOString().slice(0, 10),
    prevTo: prevTo.toISOString().slice(0, 10),
  };
}

function toLineInput(r: {
  price: number;
  quantity: number;
  item_discount: number;
  line_total_gross: number;
  line_net: number;
  line_vat?: number;
  vat_rate?: number | null;
  item_type?: string | null;
}): ReportLineInput {
  return {
    price: r.price,
    quantity: r.quantity,
    item_discount: r.item_discount,
    line_total_gross: r.line_total_gross,
    line_net: r.line_net,
    line_vat: r.line_vat,
    vat_rate: r.vat_rate,
  };
}

export type PeriodSnapshot = {
  dateFrom: string;
  dateTo: string;
  receipts_count: number;
  customers_count: number;
  services_qty: number;
  products_qty: number;
  money: { gross: MoneyTriple; net: MoneyTriple };
  avg_ticket_gross: number;
  avg_ticket_net: number;
};

export type DirectionReport = {
  today: PeriodSnapshot;
  month: PeriodSnapshot;
  monthComparison: {
    gross_real_pct: number | null;
    net_real_pct: number | null;
    receipts_pct: number | null;
  };
  crm: DirectionCrmActions;
};

function buildSnapshot(
  dateFrom: string,
  dateTo: string,
  totals: {
    receipts_count?: number;
  },
  rows: Array<{
    price: number;
    quantity: number;
    item_discount: number;
    line_total_gross: number;
    line_net: number;
    line_vat?: number;
    vat_rate?: number | null;
    item_type?: string | null;
    sale_id?: number | string | null;
  }>,
  customerBySale: Map<number, string>,
): PeriodSnapshot {
  const lines = rows.map(toLineInput);
  const money = aggregateMoneyTriples(lines);

  const customers = new Set<string>();
  let services_qty = 0;
  let products_qty = 0;

  for (const r of rows) {
    const saleId = Number(r.sale_id);
    if (Number.isFinite(saleId) && saleId > 0) {
      const cid = customerBySale.get(saleId);
      if (cid) customers.add(cid);
    }
    const qty = Number(r.quantity) || 1;
    if (r.item_type === "service") services_qty += qty;
    if (r.item_type === "product") products_qty += qty;
  }

  const receipts = Number(totals.receipts_count ?? 0);

  return {
    dateFrom,
    dateTo,
    receipts_count: receipts,
    customers_count: customers.size,
    services_qty,
    products_qty,
    money,
    avg_ticket_gross: avgTicket(money.gross.real, receipts),
    avg_ticket_net: avgTicket(money.net.real, receipts),
  };
}

export async function getDirectionReport(salonId: number): Promise<DirectionReport> {
  const todayIso = todayISO();
  const monthStart = startOfMonthISO();

  const crm = await getDirectionCrmActions(salonId);

  const [todayTurnover, monthTurnover] = await Promise.all([
    getSalonTurnover({ salonId, dateFrom: todayIso, dateTo: todayIso }),
    getSalonTurnover({ salonId, dateFrom: monthStart, dateTo: todayIso }),
  ]);

  const { prevFrom, prevTo } = shiftPeriod(monthStart, todayIso);
  const { totals: prevMonthTotals } = await getSalonTurnover({
    salonId,
    dateFrom: prevFrom,
    dateTo: prevTo,
  });

  const [todayCustomers, monthCustomers] = await Promise.all([
    fetchCustomerIdsForRows(todayTurnover.rows),
    fetchCustomerIdsForRows(monthTurnover.rows),
  ]);

  const todaySnap = buildSnapshot(
    todayIso,
    todayIso,
    todayTurnover.totals,
    todayTurnover.rows,
    todayCustomers,
  );

  const monthSnap = buildSnapshot(
    monthStart,
    todayIso,
    monthTurnover.totals,
    monthTurnover.rows,
    monthCustomers,
  );

  const prevMonthLines = await getSalonTurnover({
    salonId,
    dateFrom: prevFrom,
    dateTo: prevTo,
  });
  const prevMoney = aggregateMoneyTriples(
    prevMonthLines.rows.map(toLineInput),
  );

  return {
    today: todaySnap,
    month: monthSnap,
    monthComparison: {
      gross_real_pct: pctChange(monthSnap.money.gross.real, prevMoney.gross.real),
      net_real_pct: pctChange(monthSnap.money.net.real, prevMoney.net.real),
      receipts_pct: pctChange(
        monthSnap.receipts_count,
        Number(prevMonthTotals.receipts_count ?? 0),
      ),
    },
    crm,
  };
}

/** Esportato per test: diff reale vs teorico */
export function moneyDiff(triple: MoneyTriple): number {
  return roundMoney(triple.full - triple.real);
}
