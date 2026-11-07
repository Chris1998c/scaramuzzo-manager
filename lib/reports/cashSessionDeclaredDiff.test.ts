import { describe, expect, it } from "vitest";
import { resolveCashDeclaredAndDiff } from "@/lib/reports/cashSessionDeclaredDiff";

describe("resolveCashDeclaredAndDiff", () => {
  it("keeps non rilevato as null (never coerces to zero)", () => {
    expect(
      resolveCashDeclaredAndDiff({
        closingCash: null,
        openingCash: 0,
        grossCash: 220.2,
      }),
    ).toEqual({ declared_cash: null, cash_difference: null });
  });

  it("computes difference when closing_cash is declared", () => {
    expect(
      resolveCashDeclaredAndDiff({
        closingCash: 220.2,
        openingCash: 0,
        grossCash: 220.2,
      }),
    ).toEqual({ declared_cash: 220.2, cash_difference: 0 });

    expect(
      resolveCashDeclaredAndDiff({
        closingCash: 200,
        openingCash: 0,
        grossCash: 220.2,
      }),
    ).toEqual({ declared_cash: 200, cash_difference: -20.2 });
  });
});
