import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createSupabaseClientForRequest,
  getAuthenticatedUserFromRequest,
} from "@/lib/getAuthenticatedUserFromRequest";
import { getUserAccess, type RoleName } from "@/lib/getUserAccess";

export type CustomerContext = {
  authUserId: string;
  customerId: string;
  access: Awaited<ReturnType<typeof getUserAccess>>;
  /** Client sessione utente (cookie web o Bearer Expo) per query RLS. */
  supabase: SupabaseClient;
};

export class CustomerContextError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "CustomerContextError";
    this.status = status;
  }
}

export function isCustomerContextError(e: unknown): e is CustomerContextError {
  return e instanceof CustomerContextError;
}

function assertClienteRole(role: RoleName): void {
  if (role !== "cliente") {
    throw new CustomerContextError(
      403,
      "Accesso riservato all'app clienti (ruolo cliente richiesto).",
    );
  }
}

/**
 * Contesto obbligatorio per API /api/customer/v1/*.
 * Auth: Authorization Bearer (Expo) o cookie sessione (web).
 * customer_id proviene solo da customer_auth_links — mai dal body/query client.
 */
export async function requireCustomerContext(req: Request): Promise<CustomerContext> {
  const authResult = await getAuthenticatedUserFromRequest(req);
  if (!authResult.ok) {
    throw new CustomerContextError(401, "Autenticazione richiesta.");
  }

  let access: Awaited<ReturnType<typeof getUserAccess>>;
  try {
    access = await getUserAccess(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    if (msg === "Not authenticated") {
      throw new CustomerContextError(401, "Autenticazione richiesta.");
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("[requireCustomerContext] getUserAccess", e);
    }
    throw new CustomerContextError(
      403,
      "Impossibile verificare i permessi account.",
    );
  }

  assertClienteRole(access.role);

  const supabase = await createSupabaseClientForRequest(req);

  const { data: link, error: linkErr } = await supabase
    .from("customer_auth_links")
    .select("customer_id")
    .eq("user_id", authResult.user.id)
    .maybeSingle();

  if (linkErr) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[requireCustomerContext] customer_auth_links", linkErr);
    }
    throw new CustomerContextError(
      403,
      "Impossibile verificare il collegamento profilo cliente.",
    );
  }

  const customerId =
    link?.customer_id != null ? String(link.customer_id).trim() : "";

  if (!customerId) {
    throw new CustomerContextError(
      403,
      "Profilo cliente non collegato. Completa il collegamento account prima di continuare.",
    );
  }

  return {
    authUserId: authResult.user.id,
    customerId,
    access,
    supabase,
  };
}
