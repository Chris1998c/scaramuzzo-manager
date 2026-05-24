import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import type { StaffDrillDownData } from "@/lib/reports/buildStaffDrillDown";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";

function pickLineAmount(
  item: { gross: number; net: number },
  vatMode: VatDisplayMode,
): number {
  return vatMode === "gross" ? item.gross : item.net;
}

/** Applica Con IVA / Imponibile a tutti i campi monetari del drill-down. */
export function adjustStaffDrillDownVat(
  drill: StaffDrillDownData,
  current: StaffKpiRow,
  previous: StaffKpiRow | undefined,
  vatMode: VatDisplayMode,
): StaffDrillDownData {
  const currentMoney = pickStaffMoney(current, vatMode);
  let periodComparison = drill.periodComparison;

  if (drill.periodComparison) {
    const grossCurrent = pickStaffMoney(current, "gross");
    const ratio =
      grossCurrent.real > 0 ? currentMoney.real / grossCurrent.real : 1;
    const previous_incassato = previous
      ? pickStaffMoney(previous, vatMode).real
      : Math.round(drill.periodComparison.previous_incassato * ratio * 100) / 100;
    const delta_pct =
      previous_incassato > 0
        ? Math.round(((currentMoney.real - previous_incassato) / previous_incassato) * 1000) / 10
        : null;
    periodComparison = {
      previous_incassato,
      current_incassato: currentMoney.real,
      delta_pct,
    };
  }

  return {
    ...drill,
    topServices: drill.topServices.map((it) => ({
      ...it,
      gross: pickLineAmount(it, vatMode),
    })),
    topProducts: drill.topProducts.map((it) => ({
      ...it,
      gross: pickLineAmount(it, vatMode),
    })),
    recentCustomers: drill.recentCustomers.map((c) => ({
      ...c,
      gross: pickLineAmount(c, vatMode),
    })),
    dailyTrend: drill.dailyTrend.map((d) => ({
      ...d,
      gross: pickLineAmount(d, vatMode),
    })),
    periodComparison,
    retailSold: currentMoney.retail,
  };
}
