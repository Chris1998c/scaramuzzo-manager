import type { SupabaseClient } from "@supabase/supabase-js";

const CLI_RE = /^CLI-(\d+)$/;

/**
 * Legge i codici esistenti e calcola il prossimo progressivo CLI-000001.
 * In caso di race su due insert paralleli, ritentare l'insert con un nuovo codice.
 */
export async function allocateNextCustomerCode(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase
    .from("customers")
    .select("customer_code")
    .like("customer_code", "CLI-%");

  if (error) throw error;

  let max = 0;
  for (const row of data ?? []) {
    const code = String((row as { customer_code?: string }).customer_code ?? "");
    const m = CLI_RE.exec(code);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }

  return `CLI-${String(max + 1).padStart(6, "0")}`;
}

export type CustomerInsertRow = {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

export async function insertCustomerWithAllocatedCode(
  supabase: SupabaseClient,
  row: CustomerInsertRow,
): Promise<{ data: Record<string, unknown> | null; error: Error | null }> {
  for (let i = 0; i < 8; i++) {
    const customer_code = await allocateNextCustomerCode(supabase);
    const { data, error } = await supabase
      .from("customers")
      .insert({ ...row, customer_code })
      .select("*")
      .single();

    if (!error && data) return { data, error: null };
    if (!error) return { data: null, error: new Error("Insert cliente: nessun dato") };

    const msg = String(error.message ?? "").toLowerCase();
    const code = (error as { code?: string }).code;
    const isUnique = code === "23505" || msg.includes("duplicate") || msg.includes("unique");
    const codeCollision =
      isUnique &&
      (msg.includes("customer_code") || msg.includes("customers_customer_code"));

    if (codeCollision) continue;

    const err = error as { message?: string };
    return {
      data: null,
      error: new Error(String(err.message ?? "Insert cliente fallito")),
    };
  }

  return {
    data: null,
    error: new Error("Impossibile assegnare customer_code univoco dopo più tentativi."),
  };
}
