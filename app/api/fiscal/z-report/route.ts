import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function roleFromMetadata(user: unknown): string {
  const u = user as { user_metadata?: { role?: unknown }; app_metadata?: { role?: unknown } };
  return String(u?.user_metadata?.role ?? u?.app_metadata?.role ?? "").trim();
}

async function getRoleFromDb(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, roles:roles(name)")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const roleName = (data as { roles?: { name?: unknown } })?.roles?.name;
  return roleName ? String(roleName).trim() : null;
}

async function getReceptionSalonId(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("salon_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const sid = Number((data as any)?.salon_id);
  return Number.isFinite(sid) && sid > 0 ? sid : null;
}

async function getAllowedSalonIds(userId: string): Promise<number[]> {
  const { data, error } = await supabaseAdmin
    .from("user_salons")
    .select("salon_id")
    .eq("user_id", userId);

  if (error || !Array.isArray(data)) return [];

  return (data as { salon_id?: unknown }[])
    .map((row) => {
      const n = Number(row.salon_id);
      return Number.isFinite(n) && n > 0 ? n : null;
    })
    .filter((id): id is number => id !== null);
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const dbRole = await getRoleFromDb(authData.user.id);
    const role = (dbRole || roleFromMetadata(authData.user)).trim();
    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    const rawSalonId = Number(body?.salon_id);
    let salonId = rawSalonId;

    if (!Number.isFinite(salonId) || salonId <= 0) {
      return new Response(JSON.stringify({ error: "Invalid salon_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ✅ reception può fare Z SOLO del proprio salone
    if (role === "reception") {
      const mySalonId = await getReceptionSalonId(authData.user.id);
      if (!mySalonId) {
        return new Response(
          JSON.stringify({ error: "Reception senza salon_id associato" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (salonId !== mySalonId) {
        return new Response(
          JSON.stringify({
            error: "salon_id non consentito per questo utente",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } else {
      const allowedSalonIds = await getAllowedSalonIds(authData.user.id);
      if (!allowedSalonIds.length || !allowedSalonIds.includes(salonId)) {
        return new Response(
          JSON.stringify({
            error: "salon_id non consentito per questo utente",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Recupera fiscal profile attivo
    const { data: profile, error: profErr } = await supabaseAdmin.rpc(
      "get_fiscal_profile",
      {
        p_salon_id: salonId,
        p_on_date: new Date().toISOString().slice(0, 10),
      },
    );

    if (profErr || !profile || profile.length === 0) {
      return new Response(
        JSON.stringify({ error: "Fiscal profile non trovato" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const fiscal = profile[0];

    // Crea job di stampa Z
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("fiscal_print_jobs")
      .insert({
        salon_id: salonId,
        created_by: authData.user.id,
        kind: "z_report",
        printer_model: fiscal.printer_model,
        printer_serial: fiscal.printer_serial,
        payload: {
          legal_name: fiscal.legal_name,
          vat_number: fiscal.vat_number,
          printer_serial: fiscal.printer_serial,
          requested_at: new Date().toISOString(),
        },
        status: "pending",
      })
      .select()
      .single();

    if (jobErr) {
      return new Response(JSON.stringify({ error: jobErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, job }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "Errore Z report" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
