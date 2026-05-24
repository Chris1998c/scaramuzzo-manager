import "server-only";

import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess, type RoleName } from "@/lib/getUserAccess";

export type CustomerContext = {
  authUserId: string;
  customerId: string;
  access: Awaited<ReturnType<typeof getUserAccess>>;
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
 * Contesto obbligatorio per future API /api/customer/v1/*.
 * customer_id proviene solo da customer_auth_links — mai dal body/query client.
 */
export async function requireCustomerContext(): Promise<CustomerContext> {
  let access: Awaited<ReturnType<typeof getUserAccess>>;
  try {
    access = await getUserAccess();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    if (msg === "Not authenticated") {
      throw new CustomerContextError(401, "Autenticazione richiesta.");
    }
    throw e;
  }

  assertClienteRole(access.role);

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    throw new CustomerContextError(401, "Autenticazione richiesta.");
  }

  const { data: link, error: linkErr } = await supabase
    .from("customer_auth_links")
    .select("customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (linkErr) {
    throw new Error(`customer_auth_links: ${linkErr.message}`);
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
    authUserId: user.id,
    customerId,
    access,
  };
}
