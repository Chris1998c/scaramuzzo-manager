import { describe, expect, it } from "vitest";
import {
  BOTANICAL_REUSE_EXCLUDED_KEYS,
  botanicalFormHasTechnicalContent,
  buildBotanicalPrefillFromReuse,
  extractBotanicalReuseTechnicalPayload,
  pickLatestBotanicalCard,
  type BotanicalCardLike,
} from "@/lib/customers/reuseBotanicalCard";

function card(
  partial: Partial<BotanicalCardLike> &
    Pick<BotanicalCardLike, "id" | "created_at"> & {
      payload?: Record<string, unknown>;
    },
): BotanicalCardLike {
  return {
    id: partial.id,
    service_type: partial.service_type ?? "botanicals",
    created_at: partial.created_at,
    data: {
      kind: "botanicals",
      payload: partial.payload ?? {},
      ...(partial.data ?? {}),
    },
  };
}

describe("pickLatestBotanicalCard", () => {
  it("sceglie l’ultima per created_at anche se l’array non è ordinato", () => {
    const cards = [
      card({
        id: "a",
        created_at: "2026-01-01T10:00:00.000Z",
        payload: { mix: "old" },
      }),
      card({
        id: "c",
        created_at: "2026-06-05T16:28:41.000Z",
        payload: { mix: "latest" },
      }),
      card({
        id: "b",
        created_at: "2026-03-01T10:00:00.000Z",
        payload: { mix: "mid" },
      }),
      {
        id: "ox",
        service_type: "oxidation_color",
        created_at: "2026-12-01T10:00:00.000Z",
        data: { kind: "oxidation_color", payload: { formula: "x" } },
      },
    ];

    const latest = pickLatestBotanicalCard(cards);
    expect(latest?.id).toBe("c");
    expect(extractBotanicalReuseTechnicalPayload(latest!).mix).toBe("latest");
  });

  it("restituisce null se non ci sono schede botaniche", () => {
    expect(
      pickLatestBotanicalCard([
        {
          id: "1",
          service_type: "oxidation_color",
          created_at: "2026-01-01T00:00:00.000Z",
          data: { kind: "oxidation_color", payload: {} },
        },
      ]),
    ).toBeNull();
  });
});

describe("extractBotanicalReuseTechnicalPayload", () => {
  it("copia solo i campi tecnici e include rlp se valido", () => {
    const source = card({
      id: "c",
      created_at: "2026-06-05T16:28:41.000Z",
      payload: {
        pre_direct: "meta' 2.1",
        mix: "20 emo -20 rosso",
        heat: "no",
        processing_time: "30",
        rinse: "shampoo pH",
        rlp: "radice_lunghezze",
        goal: "nocciola caldo",
        outcome: "perfetto",
        diagnosis: { natural_level: 4 },
        botanical_result: { coverage_result: "medium" },
        general_notes: "nota",
        created_local: "2026-06-05T16:28:41.370Z",
      },
    });

    const technical = extractBotanicalReuseTechnicalPayload(source);
    expect(technical).toEqual({
      pre_direct: "meta' 2.1",
      mix: "20 emo -20 rosso",
      heat: "no",
      processing_time: "30",
      rinse: "shampoo pH",
      rlp: "radice_lunghezze",
    });

    for (const key of BOTANICAL_REUSE_EXCLUDED_KEYS) {
      expect(technical).not.toHaveProperty(key);
    }
  });

  it("ignora rlp non valido", () => {
    const technical = extractBotanicalReuseTechnicalPayload(
      card({
        id: "c",
        created_at: "2026-06-05T16:28:41.000Z",
        payload: { mix: "x", rlp: "invalid" as never },
      }),
    );
    expect(technical.rlp).toBeUndefined();
    expect(technical.mix).toBe("x");
  });
});

describe("buildBotanicalPrefillFromReuse", () => {
  it("non copia goal/outcome/diagnosis/result dalla sorgente e preserva quelli del form", () => {
    const prefilled = buildBotanicalPrefillFromReuse({
      currentPayload: {
        goal: "obiettivo visita",
        outcome: "",
        diagnosis: { prior_henna: "yes" },
      },
      technical: {
        mix: "20 emo",
        heat: "cuffia",
        rlp: "radice",
      },
    });

    expect(prefilled.kind).toBe("botanicals");
    expect(prefilled.payload.mix).toBe("20 emo");
    expect(prefilled.payload.heat).toBe("cuffia");
    expect(prefilled.payload.rlp).toBe("radice");
    expect(prefilled.payload.goal).toBe("obiettivo visita");
    expect(prefilled.payload.diagnosis).toEqual({ prior_henna: "yes" });
    expect(prefilled.payload).not.toHaveProperty("botanical_result");
    expect(prefilled.payload).not.toHaveProperty("appointment_id");
    expect(prefilled.payload).not.toHaveProperty("salon_id");
    expect(prefilled.payload).not.toHaveProperty("staff_id");
  });

  it("segnala form già compilato sui campi tecnici (serve conferma)", () => {
    expect(botanicalFormHasTechnicalContent({})).toBe(false);
    expect(botanicalFormHasTechnicalContent({ goal: "solo obiettivo" })).toBe(false);
    expect(botanicalFormHasTechnicalContent({ mix: "già scritto" })).toBe(true);
    expect(botanicalFormHasTechnicalContent({ rlp: "radice" })).toBe(true);
  });
});

describe("conservazione contesto visita", () => {
  it("il prefill non produce né richiede appointment/salon/staff (restano props pagina)", () => {
    const visitContext = {
      appointmentId: 140,
      salonId: 1,
      staffId: 57,
    };
    const prefilled = buildBotanicalPrefillFromReuse({
      currentPayload: {},
      technical: { mix: "erbe" },
    });
    // Contesto visita resta esterno al payload form.
    expect(prefilled.payload).not.toHaveProperty("appointment_id");
    expect(visitContext.appointmentId).toBe(140);
    expect(visitContext.salonId).toBe(1);
    expect(visitContext.staffId).toBe(57);
  });
});
