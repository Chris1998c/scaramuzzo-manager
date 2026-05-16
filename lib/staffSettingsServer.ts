import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { StaffSettingsRow } from "@/lib/staffSettings";

export async function fetchStaffForSettings(
  supabase: SupabaseClient,
): Promise<StaffSettingsRow[]> {
  const { data: rows, error } = await supabase
    .from("staff")
    .select(
      "id,salon_id,staff_code,name,role,phone,email,active,user_id,internal_id,mobile_enabled",
    )
    .order("name");

  if (error) throw new Error(`fetchStaffForSettings: ${error.message}`);

  const base = (rows ?? []).map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    salon_id: Number(r.salon_id),
    staff_code: String(r.staff_code ?? ""),
    name: String(r.name ?? ""),
    role: String(r.role ?? "stylist"),
    phone: r.phone != null ? String(r.phone) : null,
    email: r.email != null && String(r.email).trim() !== "" ? String(r.email).trim() : null,
    active: !!r.active,
    user_id: r.user_id != null ? String(r.user_id) : null,
    internal_id: r.internal_id != null ? Number(r.internal_id) : null,
    mobile_enabled: !!r.mobile_enabled,
    has_mobile_pin: false,
    associated_salon_ids: [] as number[],
    schedule_active_days: [] as number[],
  }));

  if (!base.length) return base;
  return enrichStaffSettingsRows(base);
}

/** Carica staff_salons e staff_schedule (service role). */
export async function enrichStaffSettingsRows(
  rows: StaffSettingsRow[],
): Promise<StaffSettingsRow[]> {
  const staffIds = rows.map((r) => r.id).filter((id) => id > 0);
  if (!staffIds.length) return rows;

  const [
    { data: salonLinks, error: slErr },
    { data: schedules, error: schErr },
    { data: pinRows, error: pinErr },
  ] = await Promise.all([
    supabaseAdmin.from("staff_salons").select("staff_id, salon_id").in("staff_id", staffIds),
    supabaseAdmin
      .from("staff_schedule")
      .select("staff_id, salon_id, day_of_week, is_active")
      .in("staff_id", staffIds),
    supabaseAdmin.from("staff").select("id, mobile_pin_hash").in("id", staffIds),
  ]);

  if (pinErr) console.error("enrichStaffSettingsRows staff pin:", pinErr.message);

  if (slErr) console.error("enrichStaffSettingsRows staff_salons:", slErr.message);
  if (schErr) console.error("enrichStaffSettingsRows staff_schedule:", schErr.message);

  const salonsByStaff = new Map<number, Set<number>>();
  for (const link of salonLinks ?? []) {
    const sid = Number((link as { staff_id: unknown }).staff_id);
    const salonId = Number((link as { salon_id: unknown }).salon_id);
    if (!Number.isInteger(sid) || sid <= 0 || !Number.isInteger(salonId) || salonId <= 0) continue;
    if (!salonsByStaff.has(sid)) salonsByStaff.set(sid, new Set());
    salonsByStaff.get(sid)!.add(salonId);
  }

  const hasPinByStaff = new Map<number, boolean>();
  for (const pr of pinRows ?? []) {
    const id = Number((pr as { id: unknown }).id);
    const hash = (pr as { mobile_pin_hash: unknown }).mobile_pin_hash;
    if (Number.isInteger(id) && id > 0) {
      hasPinByStaff.set(id, hash != null && String(hash) !== "");
    }
  }

  const scheduleByStaffSalon = new Map<string, number[]>();
  for (const row of schedules ?? []) {
    const r = row as {
      staff_id?: unknown;
      salon_id?: unknown;
      day_of_week?: unknown;
      is_active?: unknown;
    };
    if (r.is_active === false) continue;
    const sid = Number(r.staff_id);
    const salonId = Number(r.salon_id);
    const dow = Number(r.day_of_week);
    if (!Number.isInteger(sid) || !Number.isInteger(salonId) || !Number.isInteger(dow)) continue;
    const key = `${sid}:${salonId}`;
    if (!scheduleByStaffSalon.has(key)) scheduleByStaffSalon.set(key, []);
    scheduleByStaffSalon.get(key)!.push(dow);
  }

  return rows.map((row) => {
    const fromJunction = salonsByStaff.get(row.id);
    const associated = new Set<number>(fromJunction ?? []);
    associated.add(row.salon_id);

    const schedKey = `${row.id}:${row.salon_id}`;
    const schedule_active_days = [...(scheduleByStaffSalon.get(schedKey) ?? [])].sort(
      (a, b) => a - b,
    );

    return {
      ...row,
      has_mobile_pin: hasPinByStaff.get(row.id) ?? false,
      associated_salon_ids: [...associated].sort((a, b) => a - b),
      schedule_active_days,
    };
  });
}
