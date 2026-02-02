import "server-only";
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

export async function getUserAccess(): Promise<{
  role: RoleName;
  allowedSalonIds: number[];
  allowedSalons: { id: number; name: string }[];
  defaultSalonId: number | null;
}> {
  try {
    const supabase = await createServerSupabase();

    // 1) user autenticato
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    if (!auth?.user) throw new Error("Not authenticated");

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
      const payload: any = { id: userId, role_id: 4 };

      if (auth.user.email) payload.email = auth.user.email;
      if (auth.user.phone) payload.phone = auth.user.phone;
      payload.full_name =
        (auth.user.user_metadata as any)?.full_name ??
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

    // 3) user_salons assegnati
    const { data: us, error: usErr } = await supabase
      .from("user_salons")
      .select("salon_id")
      .eq("user_id", userId);

    if (usErr) throw usErr;

    const assignedSalonIds = (us ?? [])
      .map((x) => x.salon_id)
      .filter((x): x is number => typeof x === "number");

    // 4) allowed salons + nomi
    let allowedSalons: { id: number; name: string }[] = [];

    if (role === "coordinator") {
      // coordinator: tutti i saloni reali (mai magazzino in agenda)
      const { data: salons, error: sErr } = await supabase
        .from("salons")
        .select("id, name")
        .order("id", { ascending: true });

      if (sErr) throw sErr;
const all = (salons ?? []).map((s) => ({ id: s.id, name: s.name }));

const centrale = all.filter((s) => String(s.name).toLowerCase().includes("magazzino"));
const reali = all.filter((s) => !String(s.name).toLowerCase().includes("magazzino"));

allowedSalons = [...centrale, ...reali];

    } else {
      // reception/magazzino/cliente: SOLO assegnati
      if (assignedSalonIds.length) {
        const { data: salons, error: sErr } = await supabase
          .from("salons")
          .select("id, name")
          .in("id", assignedSalonIds)
          .order("id", { ascending: true });

        if (sErr) throw sErr;

        allowedSalons = (salons ?? []).map((s) => ({ id: s.id, name: s.name }));
      }
    }

    const allowedSalonIds = allowedSalons.map((s) => s.id);
    const defaultSalonId = allowedSalonIds.length ? allowedSalonIds[0] : null;

    return { role, allowedSalonIds, allowedSalons, defaultSalonId };
  } catch (err) {
    console.error("getUserAccess ERROR:", err);
    throw err;
  }
}
