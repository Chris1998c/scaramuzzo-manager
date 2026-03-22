// lib/staffSettings.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffSettingsRow = {
  id: number;
  salon_id: number;
  staff_code: string;
  name: string;
  role: string;
  phone: string | null;
  active: boolean;
  user_id: string | null;
  internal_id: number | null;
};

export async function fetchStaffForSettings(
  supabase: SupabaseClient,
): Promise<StaffSettingsRow[]> {
  const { data: rows, error } = await supabase
    .from("staff")
    .select("id,salon_id,staff_code,name,role,phone,active,user_id,internal_id")
    .order("name");

  if (error) throw new Error(`fetchStaffForSettings: ${error.message}`);

  return (rows ?? []).map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    salon_id: Number(r.salon_id),
    staff_code: String(r.staff_code ?? ""),
    name: String(r.name ?? ""),
    role: String(r.role ?? "stylist"),
    phone: r.phone != null ? String(r.phone) : null,
    active: !!r.active,
    user_id: r.user_id != null ? String(r.user_id) : null,
    internal_id: r.internal_id != null ? Number(r.internal_id) : null,
  }));
}

export const STAFF_ROLE_OPTIONS = [
  "stylist",
  "reception",
  "estetista",
  "assistant",
  "manager",
] as const;
