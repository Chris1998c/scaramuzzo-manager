import { describe, expect, it } from "vitest";

import { formatCustomerDisplayName } from "@/lib/reports/customerDisplayName";

describe("formatCustomerDisplayName", () => {
  it("usa nome e cognome", () => {
    expect(
      formatCustomerDisplayName({ first_name: "Anna", last_name: "Rossi" }, "x"),
    ).toBe("Anna Rossi");
  });

  it("fallback telefono poi email poi id", () => {
    expect(formatCustomerDisplayName({ phone: "333" }, "c1")).toBe("333");
    expect(formatCustomerDisplayName({ email: "a@b.it" }, "c1")).toBe("a@b.it");
    expect(formatCustomerDisplayName({}, "c1")).toBe("Cliente #c1");
  });
});
