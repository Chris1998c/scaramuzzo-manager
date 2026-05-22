import { describe, expect, it } from "vitest";

import {
  canViewBridgeDashboard,
  resolveBridgeSalonFilter,
} from "@/lib/bridge/bridgeWebAccess";

describe("bridgeWebAccess", () => {
  it("cliente non vede dashboard", () => {
    expect(canViewBridgeDashboard("cliente")).toBe(false);
  });

  it("coordinator vede tutti i saloni senza query", () => {
    expect(
      resolveBridgeSalonFilter(
        { role: "coordinator", staffSalonId: null, allowedSalonIds: [1, 2, 3, 4, 5] },
        null,
      ),
    ).toBeNull();
  });

  it("reception solo proprio salone", () => {
    expect(
      resolveBridgeSalonFilter(
        { role: "reception", staffSalonId: 1, allowedSalonIds: [1] },
        null,
      ),
    ).toBe(1);
  });

  it("magazzino vede tutti senza filtro query", () => {
    expect(
      resolveBridgeSalonFilter(
        { role: "magazzino", staffSalonId: 5, allowedSalonIds: [5] },
        null,
      ),
    ).toBeNull();
  });
});
