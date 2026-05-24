import { describe, expect, it, vi } from "vitest";

import {
  exportUnauthorizedResponse,
  isExportAuthError,
  requireCoordinatorExportAccess,
} from "@/lib/reports/exportRouteAuth";

vi.mock("@/lib/getUserAccess", () => ({
  getUserAccess: vi.fn(),
}));

import { getUserAccess } from "@/lib/getUserAccess";

describe("exportRouteAuth", () => {
  it("isExportAuthError riconosce Not authenticated", () => {
    expect(isExportAuthError(new Error("Not authenticated"))).toBe(true);
    expect(isExportAuthError(new Error("altro"))).toBe(false);
  });

  it("requireCoordinatorExportAccess restituisce 401 se non autenticato", async () => {
    vi.mocked(getUserAccess).mockRejectedValueOnce(new Error("Not authenticated"));
    const result = await requireCoordinatorExportAccess();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("exportUnauthorizedResponse è 401", () => {
    expect(exportUnauthorizedResponse().status).toBe(401);
  });
});
