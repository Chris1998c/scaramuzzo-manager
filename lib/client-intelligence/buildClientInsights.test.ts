import { describe, expect, it } from "vitest";

import {
  buildClientInsights,
  type ClientIntelligencePayload,
} from "./buildClientInsights";

function makePayload(
  cards: ClientIntelligencePayload["lastServiceCards"],
): ClientIntelligencePayload {
  return {
    profile: null,
    lastServiceCards: cards,
    recentAppointments: [],
    recentPurchases: { sales: [], saleItems: [] },
  };
}

function card(service_type: string, payload: Record<string, unknown>) {
  return { service_type, data: { kind: service_type, payload }, created_at: "2026-06-01" };
}

describe("buildClientInsights – Step 3A campi strutturati", () => {
  it("payload null → 5 array vuoti (contratto invariato)", () => {
    const r = buildClientInsights(null);
    expect(Object.keys(r).sort()).toEqual(
      ["recommendedProducts", "recommendedServices", "suggestedActions", "summary", "warnings"].sort(),
    );
    expect(r.summary).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("legge payload.general_notes come warning", () => {
    const r = buildClientInsights(
      makePayload([card("oxidation_color", { general_notes: "cliente con cute sensibile" })]),
    );
    expect(r.warnings.some((w) => w.includes("cute sensibile"))).toBe(true);
  });

  it("diagnosi: henné/box dye/patch test generano warning", () => {
    const r = buildClientInsights(
      makePayload([
        card("oxidation_color", {
          diagnosis: {
            prior_henna: "unknown",
            prior_box_dye: "yes",
            patch_test_result: "positive",
          },
        }),
      ]),
    );
    expect(r.warnings.some((w) => /henn/i.test(w))).toBe(true);
    expect(r.warnings.some((w) => /box dye|supermercato/i.test(w))).toBe(true);
    expect(r.warnings.some((w) => /patch test positivo/i.test(w))).toBe(true);
  });

  it("diagnosi: bianchi elevati e resistenti → suggestedActions", () => {
    const r = buildClientInsights(
      makePayload([
        card("oxidation_color", {
          diagnosis: { white_pct_band: "gt_75", white_resistance: "high" },
        }),
      ]),
    );
    expect(r.suggestedActions.some((s) => /bianchi elevati/i.test(s))).toBe(true);
    expect(r.suggestedActions.some((s) => /bianchi resistenti/i.test(s))).toBe(true);
  });

  it("colore: scostamento, ossigeno alto e posa lunga → warning", () => {
    const r = buildClientInsights(
      makePayload([
        card("oxidation_color", {
          color: {
            target_level: 6,
            achieved_level: 7,
            developer_vol: 40,
            processing_minutes: 60,
          },
        }),
      ]),
    );
    expect(r.warnings.some((w) => /scostamento colore/i.test(w))).toBe(true);
    expect(r.warnings.some((w) => /ossigeno elevato \(40 vol\)/i.test(w))).toBe(true);
    expect(r.warnings.some((w) => /tempo posa elevato \(60 min\)/i.test(w))).toBe(true);
  });

  it("botaniche: riflesso caldo, raffreddamento e copertura bassa → suggestedActions", () => {
    const r = buildClientInsights(
      makePayload([
        card("botanicals", {
          botanical_result: {
            warm_reflection: "strong",
            cool_correction_needed: "yes",
            coverage_result: "low",
          },
        }),
      ]),
    );
    expect(r.suggestedActions.some((s) => /raffreddamento/i.test(s))).toBe(true);
    expect(r.suggestedActions.some((s) => /copertura bianchi bassa/i.test(s))).toBe(true);
  });

  it("schede senza campi strutturati → nessun warning nuovo", () => {
    const r = buildClientInsights(makePayload([card("gloss", {})]));
    expect(r.warnings.some((w) => /henn|patch test|ossigeno|scostamento/i.test(w))).toBe(false);
  });
});
