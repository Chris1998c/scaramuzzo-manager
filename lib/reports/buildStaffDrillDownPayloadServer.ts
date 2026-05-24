import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import {
  buildStaffDrillDown,
  type StaffDrillDownData,
} from "@/lib/reports/buildStaffDrillDown";
import type { ReportRow } from "@/lib/reports/getSalonTurnover";
import { formatCustomerDisplayName } from "@/lib/reports/customerDisplayName";
import { loadCustomersByIds } from "@/lib/reports/loadCustomersByIds";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";

export type StaffDrillDownByStaff = Record<string, StaffDrillDownData>;

function applyCustomerNames(
  drill: StaffDrillDownData,
  names: Map<string, { first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null }>,
): StaffDrillDownData {
  return {
    ...drill,
    recentCustomers: drill.recentCustomers.map((c) => ({
      ...c,
      customer_name: formatCustomerDisplayName(names.get(c.customer_id), c.customer_id),
    })),
    customersWithoutRetail: drill.customersWithoutRetail.map((c) => ({
      customer_id: c.customer_id,
      customer_name: formatCustomerDisplayName(names.get(c.customer_id), c.customer_id),
    })),
  };
}

/** Costruisce drill-down per tutti gli staff lato server (payload compatto per il client). */
export async function buildStaffDrillDownPayloadServer(input: {
  rows: ReportRow[];
  staffPerformance: StaffKpiRow[];
  previousStaffPerformance: StaffKpiRow[];
  customerBySaleId: Record<string, string>;
  vatMode?: VatDisplayMode;
}): Promise<StaffDrillDownByStaff> {
  const mode = input.vatMode ?? "gross";
  const previousByStaff = new Map<number, StaffKpiRow>();
  for (const r of input.previousStaffPerformance) {
    previousByStaff.set(r.staff_id, r);
  }

  const rawByStaff: Record<string, StaffDrillDownData> = {};
  const customerIds = new Set<string>();

  for (const staff of input.staffPerformance) {
    const drill = buildStaffDrillDown({
      staffId: staff.staff_id,
      rows: input.rows,
      customerBySaleId: input.customerBySaleId,
      current: staff,
      previous: previousByStaff.get(staff.staff_id) ?? null,
      vatMode: mode,
    });

    for (const c of drill.recentCustomers) customerIds.add(c.customer_id);
    for (const c of drill.customersWithoutRetail) customerIds.add(c.customer_id);

    rawByStaff[String(staff.staff_id)] = drill;
  }

  const names = await loadCustomersByIds([...customerIds]);

  const out: StaffDrillDownByStaff = {};
  for (const [staffId, drill] of Object.entries(rawByStaff)) {
    out[staffId] = applyCustomerNames(drill, names);
  }

  return out;
}
