import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import type { StaffDrillDownData } from "@/lib/reports/buildStaffDrillDown";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";

/** Aggiorna solo i campi monetari del drill-down al cambio lordo/imponibile (senza righe grezze). */
export function adjustStaffDrillDownVat(
  drill: StaffDrillDownData,
  current: StaffKpiRow,
  previous: StaffKpiRow | undefined,
  vatMode: VatDisplayMode,
): StaffDrillDownData {
  const currentMoney = pickStaffMoney(current, vatMode);
  let periodComparison = drill.periodComparison;

  if (previous && drill.periodComparison) {
    const prevMoney = pickStaffMoney(previous, vatMode);
    const delta_pct =
      prevMoney.real > 0
        ? Math.round(((currentMoney.real - prevMoney.real) / prevMoney.real) * 1000) / 10
        : null;
    periodComparison = {
      previous_incassato: prevMoney.real,
      current_incassato: currentMoney.real,
      delta_pct,
    };
  }

  return {
    ...drill,
    periodComparison,
    retailSold: currentMoney.retail,
  };
}
