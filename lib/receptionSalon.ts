import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Restituisce il salon_id del receptionist: prima assegnazione staff_salons, altrimenti staff.salon_id.
 * Usabile nelle API per vincolare carico/trasferimenti al solo salone del reception.
 */
export async function getReceptionSalonId(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, salon_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const staffId = Number((data as { id?: unknown }).id);
  if (Number.isInteger(staffId) && staffId > 0) {
    const { data: links, error: linkErr } = await supabaseAdmin
      .from("staff_salons")
      .select("salon_id")
      .eq("staff_id", staffId)
      .order("salon_id", { ascending: true })
      .limit(1);

    if (!linkErr && links?.[0]) {
      const sid = Number(links[0].salon_id);
      if (Number.isFinite(sid) && sid > 0) return sid;
    }
  }

  const sid = typeof (data as { salon_id?: unknown }).salon_id === "number"
    ? (data as { salon_id: number }).salon_id
    : Number((data as { salon_id?: unknown }).salon_id);

  return Number.isFinite(sid) && sid > 0 ? sid : null;
}
