import { describe, expect, it } from "vitest";

import { emptyStaffKpiRow, mergeStaffKpiWithSalonStaff } from "@/lib/reports/staffKpiConstants";
import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";

function kpi(staffId: number, real: number): StaffKpiRow {
  const base = emptyStaffKpiRow(staffId, `Staff ${staffId}`);
  base.gross.real = real;
  base.net.real = real;
  return base;
}

describe("mergeStaffKpiWithSalonStaff", () => {
  it("aggiunge staff attivi senza vendite e mantiene Non assegnato in fondo", () => {
    const merged = mergeStaffKpiWithSalonStaff(
      [kpi(2, 100), kpi(0, 25)],
      [
        { id: 1, name: "Anna" },
        { id: 2, name: "Bob" },
      ],
    );

    expect(merged.map((r) => r.staff_id)).toEqual([2, 1, 0]);
    expect(merged.find((r) => r.staff_id === 1)?.gross.real).toBe(0);
    expect(merged.find((r) => r.staff_id === 0)?.gross.real).toBe(25);
  });
});
