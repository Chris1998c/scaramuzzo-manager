import { describe, expect, it } from "vitest";

import {
  parseCustomerAppIsoDate,
  parseCustomerAppServiceIds,
} from "./customerAppQuery";
import { MAX_CUSTOMER_APP_SERVICE_IDS } from "./customerAppLimits";

describe("parseCustomerAppServiceIds", () => {
  it("legge service_ids ripetuti e CSV", () => {
    const url = new URL(
      "https://x/api?service_ids=1&service_ids=2&service_ids=1",
    );
    expect(parseCustomerAppServiceIds(url)).toEqual([1, 2]);

    const csv = new URL("https://x/api?service_ids=3,4");
    expect(parseCustomerAppServiceIds(csv)).toEqual([3, 4]);
  });

  it("null se assente", () => {
    expect(parseCustomerAppServiceIds(new URL("https://x/api"))).toBeNull();
  });

  it("route availability deve rifiutare oltre MAX", () => {
    const ids = Array.from({ length: MAX_CUSTOMER_APP_SERVICE_IDS + 1 }, (_, i) => i + 1);
    expect(ids.length).toBeGreaterThan(MAX_CUSTOMER_APP_SERVICE_IDS);
  });
});

describe("parseCustomerAppIsoDate", () => {
  it("accetta YYYY-MM-DD valido", () => {
    expect(parseCustomerAppIsoDate("2026-06-15")).toBe("2026-06-15");
  });

  it("rifiuta formato invalido", () => {
    expect(parseCustomerAppIsoDate("15-06-2026")).toBeNull();
    expect(parseCustomerAppIsoDate("2026-13-40")).toBeNull();
  });
});
