import "server-only";

import { NextResponse } from "next/server";

import type { FindCustomersByPhoneResult } from "@/lib/customerClaim/findCustomersByPhone";

export type ResolvedClaimPhoneCustomer = { id: string; phone: string };

export type ResolveClaimPhoneLookupResult =
  | { ok: true; customer: ResolvedClaimPhoneCustomer }
  | { ok: false; response: NextResponse };

/** Mappa risultato lookup telefono → cliente unico o risposta HTTP errore. */
export function resolveUniqueCustomerFromClaimPhoneLookup(
  lookup: FindCustomersByPhoneResult,
): ResolveClaimPhoneLookupResult {
  if (!lookup.ok) {
    if (lookup.reason === "invalid") {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: "Numero di telefono non valido." },
          { status: 400 },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Errore durante la ricerca del profilo." },
        { status: 500 },
      ),
    };
  }

  if (lookup.customers.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Non abbiamo trovato un profilo associato a questo numero.",
          code: "phone_not_found",
        },
        { status: 404 },
      ),
    };
  }

  if (lookup.customers.length > 1) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            "Abbiamo trovato più profili con questo numero. Contatta il salone.",
          code: "phone_ambiguous",
        },
        { status: 409 },
      ),
    };
  }

  return { ok: true, customer: lookup.customers[0] };
}
