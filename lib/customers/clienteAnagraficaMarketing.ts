/**
 * Marketing WhatsApp fields for customer anagrafica save.
 * Keeps existing marketing_consent_at rules; does not invent new timestamp semantics.
 */

export type ClienteAnagraficaMarketingFields = {
  marketing_whatsapp_opt_in: boolean;
  marketing_consent_at: string | null;
};

/** Map DB row → form initial. Must not hardcode false/null when the row has real values. */
export function mapCustomerMarketingToInitial(row: {
  marketing_whatsapp_opt_in?: boolean | null;
  marketing_consent_at?: string | null;
}): ClienteAnagraficaMarketingFields {
  return {
    marketing_whatsapp_opt_in: row.marketing_whatsapp_opt_in === true,
    marketing_consent_at: row.marketing_consent_at ?? null,
  };
}

/**
 * Existing form rule:
 * - nextOptIn true + (was false OR missing consent_at) → stamp nowIso
 * - nextOptIn true + was true + has consent_at → keep currentConsentAt
 * - nextOptIn false → keep currentConsentAt (historical on revoke)
 */
export function resolveMarketingConsentAt(args: {
  previousOptIn: boolean;
  nextOptIn: boolean;
  currentConsentAt: string | null;
  nowIso: string;
}): string | null {
  if (args.nextOptIn) {
    if (!args.previousOptIn || !args.currentConsentAt) {
      return args.nowIso;
    }
    return args.currentConsentAt;
  }
  return args.currentConsentAt;
}

export function buildClienteAnagraficaUpdatePayload(args: {
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  marketing_whatsapp_opt_in: boolean;
  marketing_consent_at: string | null;
  previousOptIn: boolean;
  nowIso: string;
}) {
  return {
    first_name: args.first_name,
    last_name: args.last_name,
    phone: args.phone,
    email: args.email,
    address: args.address,
    notes: args.notes,
    marketing_whatsapp_opt_in: args.marketing_whatsapp_opt_in,
    marketing_consent_at: resolveMarketingConsentAt({
      previousOptIn: args.previousOptIn,
      nextOptIn: args.marketing_whatsapp_opt_in,
      currentConsentAt: args.marketing_consent_at,
      nowIso: args.nowIso,
    }),
  };
}
