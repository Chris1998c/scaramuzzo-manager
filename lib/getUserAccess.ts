import "server-only";
import { cache } from "react";
import {
  createSupabaseClientForRequest,
  parseAuthorizationBearer,
} from "@/lib/getAuthenticatedUserFromRequest";
import { createServerSupabase } from "@/lib/supabaseServer";

export type RoleName = "coordinator" | "reception" | "magazzino" | "cliente";

function roleIdToName(roleId: number | null | undefined): RoleName {
  switch (roleId) {
    case 1:
      return "coordinator";
    case 2:
      return "reception";
    case 3:
      return "magazzino";
    case 4:
      return "cliente";
    default:
      return "cliente";
  }
}

type UserAccess = {
  role: RoleName;
  allowedSalonIds: number[];
  allowedSalons: { id: number; name: string }[];
  defaultSalonId: number | null;
  staffId: number | null;
  staffSalonId: number | null;
};

async function loadUserAccess(req?: Request): Promise<UserAccess> {
  const supabase = req
    ? await createSupabaseClientForRequest(req)
    : await createServerSupabase();

  const bearer = req ? parseAuthorizationBearer(req) : null;

  // 1) user autenticato (cookie SSR o Bearer Expo)
  const { data: auth, error: authErr } = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser();
  if (authErr || !auth?.user) throw new Error("Not authenticated");

  const userId = auth.user.id;

  // 2) profilo su public.users (se manca, prova a crearlo)
  const { data: u0, error: u0Err } = await supabase
    .from("users")
    .select("id, role_id")
    .eq("id", userId)
    .maybeSingle();

  if (u0Err) throw u0Err;

  let u = u0;

  if (!u) {
    const payload: Record<string, unknown> = { id: userId, role_id: 4 };

    if (auth.user.email) payload.email = auth.user.email;
    if (auth.user.phone) payload.phone = auth.user.phone;

    payload.full_name =
      (auth.user.user_metadata as { full_name?: string } | undefined)?.full_name ??
      auth.user.email ??
      "User";

    const { data: created, error: cErr } = await supabase
      .from("users")
      .insert(payload)
      .select("id, role_id")
      .single();

    if (cErr) throw cErr;
    u = created;
  }

  const role = roleIdToName(u.role_id);

  // 3) staff + user_salons in parallelo (indipendenti dopo userId)
  const [staffRes, usRes] = await Promise.all([
    supabase.from("staff").select("id, salon_id").eq("user_id", userId).maybeSingle(),
    supabase.from("user_salons").select("salon_id").eq("user_id", userId),
  ]);

  if (staffRes.error) {
    console.error("staff lookup error", { userId, staffErr: staffRes.error });
  }
  if (usRes.error) throw usRes.error;

  const staff = staffRes.data;
  const assignedSalonIds = (usRes.data ?? [])
    .map((x) => x.salon_id)
    .filter((x): x is number => typeof x === "number");

  // 4) allowed salons + staff_salons in parallelo quando possibile
  const salonsPromise =
    role === "coordinator"
      ? supabase.from("salons").select("id, name").order("id", { ascending: true })
      : assignedSalonIds.length
        ? supabase
            .from("salons")
            .select("id, name")
            .in("id", assignedSalonIds)
            .order("id", { ascending: true })
        : Promise.resolve({ data: [] as { id: number; name: string }[], error: null });

  const staffSalonPromise = staff?.id
    ? supabase
        .from("staff_salons")
        .select("salon_id")
        .eq("staff_id", staff.id)
        .order("salon_id", { ascending: true })
        .limit(1)
    : Promise.resolve({ data: null as { salon_id: number }[] | null, error: null });

  const [salonsRes, staffSalonRes] = await Promise.all([salonsPromise, staffSalonPromise]);

  if (salonsRes.error) throw salonsRes.error;

  const all = (salonsRes.data ?? []).map((s) => ({ id: s.id, name: s.name }));
  let allowedSalons: { id: number; name: string }[] = [];

  if (role === "coordinator") {
    const centrale = all.filter((s) => String(s.name).toLowerCase().includes("magazzino"));
    const reali = all.filter((s) => !String(s.name).toLowerCase().includes("magazzino"));
    allowedSalons = [...centrale, ...reali];
  } else {
    allowedSalons = all;
  }

  const allowedSalonIds = allowedSalons.map((s) => s.id);
  const defaultSalonId = allowedSalonIds.length ? allowedSalonIds[0] : null;

  const staffId = staff?.id ?? null;

  let staffSalonId: number | null = null;
  if (!staffSalonRes.error && staffSalonRes.data?.[0]) {
    const sid = Number(staffSalonRes.data[0].salon_id);
    if (Number.isFinite(sid) && sid > 0) staffSalonId = sid;
  }

  if (staffSalonId === null) {
    const legacy = staff?.salon_id != null ? Number(staff.salon_id) : NaN;
    staffSalonId =
      Number.isFinite(legacy) && legacy > 0 ? legacy : (defaultSalonId ?? null);
  }

  return {
    role,
    allowedSalonIds,
    allowedSalons,
    defaultSalonId,
    staffId,
    staffSalonId,
  };
}

/** Dedup per richiesta RSC (layout + page + nested layout). */
const getUserAccessCached = cache(() => loadUserAccess());

/**
 * Accesso utente + sedi consentite.
 * Senza `req`: dedupe React.cache nella stessa render request.
 * Con `req` (API Bearer/cookie): nessuna cache cross-request.
 */
export async function getUserAccess(req?: Request): Promise<UserAccess> {
  if (req) return loadUserAccess(req);
  return getUserAccessCached();
}
