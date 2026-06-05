import { beforeEach, describe, expect, it, vi } from "vitest";

// Registra le chiamate ai filtri per tabella, per verificare la query schede.
const { orCalls, eqCalls } = vi.hoisted(() => ({
  orCalls: [] as Array<{ table: string; arg: string }>,
  eqCalls: [] as Array<{ table: string; column: string; value: unknown }>,
}));

vi.mock("@/lib/supabaseAdmin", () => {
  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        eqCalls.push({ table, column, value });
        return builder;
      },
      in: () => builder,
      order: () => builder,
      or: (arg: string) => {
        orCalls.push({ table, arg });
        return builder;
      },
      maybeSingle: () => Promise.resolve({ data: null }),
      limit: () => Promise.resolve({ data: [] }),
    };
    return builder;
  }
  return { supabaseAdmin: { from: (table: string) => makeBuilder(table) } };
});

import { getClientIntelligenceData } from "./getClientIntelligenceData";

describe("getClientIntelligenceData – customer_service_cards salon scope", () => {
  beforeEach(() => {
    orCalls.length = 0;
    eqCalls.length = 0;
  });

  it("include le schede con salon_id NULL e quelle del salone corrente", async () => {
    await getClientIntelligenceData("cust-1", 2);

    const cardOr = orCalls.find((c) => c.table === "customer_service_cards");
    expect(cardOr?.arg).toBe("salon_id.eq.2,salon_id.is.null");
  });

  it("non filtra le schede con .eq(\"salon_id\") (solo .eq customer_id)", async () => {
    await getClientIntelligenceData("cust-1", 2);

    const cardEqCols = eqCalls
      .filter((c) => c.table === "customer_service_cards")
      .map((c) => c.column);
    expect(cardEqCols).toContain("customer_id");
    expect(cardEqCols).not.toContain("salon_id");
  });
});
