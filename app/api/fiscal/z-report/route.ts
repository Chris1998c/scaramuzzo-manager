import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function roleFromUser(user: any): string {
  return String(
    user?.user_metadata?.role ?? user?.app_metadata?.role ?? "",
  ).trim();
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

    const role = roleFromUser(authData.user);
    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    const salonId = Number(body?.salon_id);

    if (!Number.isFinite(salonId) || salonId <= 0) {
      return new Response(JSON.stringify({ error: "Invalid salon_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ✅ reception può fare Z SOLO del proprio salone
    if (role === "reception") {
      const { data: staffRow, error: staffErr } = await supabaseAdmin
        .from("staff")
        .select("salon_id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (staffErr || !staffRow?.salon_id) {
        return new Response(
          JSON.stringify({ error: "Reception senza salon_id associato" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const mySalonId = Number(staffRow.salon_id);
      if (
        !Number.isFinite(mySalonId) ||
        mySalonId <= 0 ||
        salonId !== mySalonId
      ) {
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
