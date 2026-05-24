import { createServerSupabase } from "@/lib/supabaseServer";
import type { CustomerNameFields } from "@/lib/reports/customerDisplayName";

export async function loadCustomersByIds(ids: string[]): Promise<Map<string, CustomerNameFields>> {
  const map = new Map<string, CustomerNameFields>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;

  const supabase = await createServerSupabase();
  const chunkSize = 200;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email")
      .in("id", chunk);

    if (error) throw new Error(error.message);

    for (const c of data ?? []) {
      const id = String((c as { id?: unknown }).id ?? "");
      if (!id) continue;
      map.set(id, c as CustomerNameFields);
    }
  }

  return map;
}
