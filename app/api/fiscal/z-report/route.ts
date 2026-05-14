import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";

const Z_REPORT_LEGACY_GONE =
  "Z report disponibile solo tramite chiusura sessione cassa.";

export async function POST(_req: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const access = await getUserAccess();
    const role = access.role;
    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: Z_REPORT_LEGACY_GONE }), {
      status: 410,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore Z report";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
