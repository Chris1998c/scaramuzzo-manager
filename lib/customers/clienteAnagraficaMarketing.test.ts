import { describe, expect, it } from "vitest";
import {
  buildClienteAnagraficaUpdatePayload,
  mapCustomerMarketingToInitial,
  resolveMarketingConsentAt,
} from "@/lib/customers/clienteAnagraficaMarketing";

const NOW = "2026-11-11T11:00:00.000Z";
const CONSENT_AT = "2025-06-15T09:30:00.000Z";

const baseAnagrafica = {
  first_name: "Maria",
  last_name: "Rossi",
  phone: "+393331112233",
  email: "maria@example.com" as string | null,
  address: "Via Roma 1" as string | null,
  notes: "note" as string | null,
};

describe("mapCustomerMarketingToInitial", () => {
  it("preserva opt-in true e consent_at dal DB (non hardcodare false)", () => {
    expect(
      mapCustomerMarketingToInitial({
        marketing_whatsapp_opt_in: true,
        marketing_consent_at: CONSENT_AT,
      }),
    ).toEqual({
      marketing_whatsapp_opt_in: true,
      marketing_consent_at: CONSENT_AT,
    });
  });

  it("mappa false/null senza inventare consenso", () => {
    expect(
      mapCustomerMarketingToInitial({
        marketing_whatsapp_opt_in: false,
        marketing_consent_at: null,
      }),
    ).toEqual({
      marketing_whatsapp_opt_in: false,
      marketing_consent_at: null,
    });
  });
});

describe("buildClienteAnagraficaUpdatePayload — anagrafica-only save", () => {
  it("opt-in=true: modifica solo nome lascia opt-in e consent_at invariati", () => {
    const marketing = mapCustomerMarketingToInitial({
      marketing_whatsapp_opt_in: true,
      marketing_consent_at: CONSENT_AT,
    });
    const payload = buildClienteAnagraficaUpdatePayload({
      ...baseAnagrafica,
      first_name: "Maria Luisa",
      ...marketing,
      previousOptIn: marketing.marketing_whatsapp_opt_in,
      nowIso: NOW,
    });

    expect(payload.first_name).toBe("Maria Luisa");
    expect(payload.marketing_whatsapp_opt_in).toBe(true);
    expect(payload.marketing_consent_at).toBe(CONSENT_AT);
  });

  it("REGRESSIONE pre-fix: hardcode false/null sul form azzera un opt-in DB true", () => {
    const buggyInitial = {
      marketing_whatsapp_opt_in: false as const,
      marketing_consent_at: null as string | null,
    };
    const payload = buildClienteAnagraficaUpdatePayload({
      ...baseAnagrafica,
      first_name: "Maria Luisa",
      ...buggyInitial,
      previousOptIn: buggyInitial.marketing_whatsapp_opt_in,
      nowIso: NOW,
    });

    expect(payload.marketing_whatsapp_opt_in).toBe(false);
    expect(payload.marketing_consent_at).toBeNull();
  });

  it("opt-in=false resta false e non tocca il timestamp storico", () => {
    const marketing = mapCustomerMarketingToInitial({
      marketing_whatsapp_opt_in: false,
      marketing_consent_at: CONSENT_AT,
    });
    const payload = buildClienteAnagraficaUpdatePayload({
      ...baseAnagrafica,
      phone: "+393339998877",
      ...marketing,
      previousOptIn: false,
      nowIso: NOW,
    });

    expect(payload.marketing_whatsapp_opt_in).toBe(false);
    expect(payload.marketing_consent_at).toBe(CONSENT_AT);
  });

  it("toggle esplicito false→true imposta consent_at a now", () => {
    const payload = buildClienteAnagraficaUpdatePayload({
      ...baseAnagrafica,
      marketing_whatsapp_opt_in: true,
      marketing_consent_at: null,
      previousOptIn: false,
      nowIso: NOW,
    });

    expect(payload.marketing_whatsapp_opt_in).toBe(true);
    expect(payload.marketing_consent_at).toBe(NOW);
  });

  it("toggle esplicito true→false mantiene consent_at storico", () => {
    const payload = buildClienteAnagraficaUpdatePayload({
      ...baseAnagrafica,
      marketing_whatsapp_opt_in: false,
      marketing_consent_at: CONSENT_AT,
      previousOptIn: true,
      nowIso: NOW,
    });

    expect(payload.marketing_whatsapp_opt_in).toBe(false);
    expect(payload.marketing_consent_at).toBe(CONSENT_AT);
  });
});

describe("resolveMarketingConsentAt", () => {
  it("non ristampa se già opt-in con timestamp", () => {
    expect(
      resolveMarketingConsentAt({
        previousOptIn: true,
        nextOptIn: true,
        currentConsentAt: CONSENT_AT,
        nowIso: NOW,
      }),
    ).toBe(CONSENT_AT);
  });
});
