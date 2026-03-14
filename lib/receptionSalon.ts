import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Restituisce il salon_id del receptionist da staff (source of truth).
 * Usabile nelle API per vincolare carico/trasferimenti al solo salone del reception.
 */
export async function getReceptionSalonId(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("salon_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const sid = typeof (data as { salon_id?: unknown }).salon_id === "number"
    ? (data as { salon_id: number }).salon_id
    : Number((data as { salon_id?: unknown }).salon_id);

  return Number.isFinite(sid) && sid > 0 ? sid : null;
}
