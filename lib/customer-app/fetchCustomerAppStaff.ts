import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";

export type CustomerAppStaffDto = {
  id: number;
  display_name: string;
  avatar_url?: string;
};

/**
 * Collaboratori prenotabili (pubblici). Nessun staff-services in DB → service_id ignorato per filtro.
 */
export async function fetchCustomerAppStaff(
  admin: SupabaseClient,
  salonId: number,
  _serviceId?: number | null,
): Promise<CustomerAppStaffDto[]> {
  const rows = await fetchActiveStaffForSalon(admin, salonId, "id, name");

  const staff: CustomerAppStaffDto[] = rows
    .map((row) => {
      const id = Number(row.id);
      const name = String(row.name ?? "").trim();
      if (!Number.isInteger(id) || id <= 0 || !name) return null;
      return { id, display_name: name };
    })
    .filter((x): x is CustomerAppStaffDto => x != null);

  staff.sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "it", { sensitivity: "base" }),
  );

  return staff;
}
