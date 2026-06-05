import { describe, it, expect } from "vitest";
import { minimizeContext } from "./buildClientInsightsWithAi";
import type { ClientIntelligencePayload } from "./buildClientInsights";

type Card = ClientIntelligencePayload["lastServiceCards"][number];

function makePayload(
  cards: Card[],
  profile: Record<string, unknown> | null = null,
): ClientIntelligencePayload {
  return {
    profile,
    lastServiceCards: cards,
    recentAppointments: [],
    recentPurchases: { sales: [], saleItems: [] },
  };
}

function card(service_type: string, payload: Record<string, unknown>): Card {
  return { service_type, data: { payload } };
}

describe("minimizeContext – Step 3B campi strutturati per LLM", () => {
  it("include diagnosis (solo chiavi whitelisted) e omette patch_test_date", () => {
    const ctx = minimizeContext(
      makePayload([
        card("oxidation", {
          diagnosis: {
            white_pct_band: "gt_75",
            white_resistance: "high",
            natural_level: 6,
            prior_henna: "yes",
            prior_box_dye: "unknown",
            patch_test_result: "not_done",
            patch_test_date: "2026-01-01",
          },
        }),
      ]),
    );
    const sc = (ctx.serviceCards as Array<Record<string, unknown>>)[0];
    const diagnosis = sc.diagnosis as Record<string, unknown>;
    expect(diagnosis).toMatchObject({
      white_pct_band: "gt_75",
      white_resistance: "high",
      natural_level: 6,
      prior_henna: "yes",
      prior_box_dye: "unknown",
      patch_test_result: "not_done",
    });
    expect(diagnosis.patch_test_date).toBeUndefined();
    expect(JSON.stringify(ctx)).not.toContain("2026-01-01");
  });

  it("include color con numeri preservati", () => {
    const ctx = minimizeContext(
      makePayload([
        card("gloss", {
          color: {
            target_level: 7,
            target_tone: "1",
            achieved_level: 6,
            achieved_tone: "0",
            developer_vol: 20,
            processing_minutes: 35,
          },
        }),
      ]),
    );
    const sc = (ctx.serviceCards as Array<Record<string, unknown>>)[0];
    expect(sc.color).toMatchObject({
      target_level: 7,
      target_tone: "1",
      achieved_level: 6,
      developer_vol: 20,
      processing_minutes: 35,
    });
    expect(sc.botanical_result).toBeUndefined();
  });

  it("include botanical_result separato dal colore chimico", () => {
    const ctx = minimizeContext(
      makePayload([
        card("botanicals", {
          botanical_result: {
            coverage_result: "medium",
            warm_reflection: "strong",
            cool_correction_needed: "yes",
            achieved_level: 5,
            achieved_tone: "caldo",
            processing_minutes: 60,
          },
        }),
      ]),
    );
    const sc = (ctx.serviceCards as Array<Record<string, unknown>>)[0];
    expect(sc.botanical_result).toMatchObject({
      coverage_result: "medium",
      warm_reflection: "strong",
      cool_correction_needed: "yes",
      achieved_level: 5,
      processing_minutes: 60,
    });
    expect(sc.color).toBeUndefined();
  });

  it("include general_notes troncata", () => {
    const long = "x".repeat(300);
    const ctx = minimizeContext(makePayload([card("treatment", { general_notes: long })]));
    const sc = (ctx.serviceCards as Array<Record<string, unknown>>)[0];
    const gn = sc.general_notes as string;
    expect(gn.length).toBeLessThan(long.length);
    expect(gn.endsWith("…")).toBe(true);
  });

  it("esclude PII da profilo e da blocchi strutturati", () => {
    const ctx = minimizeContext(
      makePayload(
        [
          card("oxidation", {
            diagnosis: {
              white_pct_band: "50_75",
              customer_id: "CLI-999999",
              phone: "3331234567",
              email: "mario@example.com",
            },
          }),
        ],
        {
          texture: "wavy",
          allergies: "ppd",
          first_name: "Mario",
          last_name: "Rossi",
          phone: "3331234567",
          email: "mario@example.com",
        },
      ),
    );
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain("Mario");
    expect(serialized).not.toContain("Rossi");
    expect(serialized).not.toContain("3331234567");
    expect(serialized).not.toContain("mario@example.com");
    expect(serialized).not.toContain("CLI-999999");
    // i dati tecnici utili restano
    expect(serialized).toContain("wavy");
    expect(serialized).toContain("ppd");
    expect(serialized).toContain("50_75");
  });

  it("schede senza campi strutturati restano minimali", () => {
    const ctx = minimizeContext(makePayload([card("oxidation", {})]));
    const sc = (ctx.serviceCards as Array<Record<string, unknown>>)[0];
    expect(sc).toEqual({ service_type: "oxidation" });
  });
});
