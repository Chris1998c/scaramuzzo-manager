import { createServerSupabase } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = createServerSupabase();

  // prende ruolo e salone dal JWT custom claims
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { role, salon_id } = user.user_metadata;

  // Coordinatore → vede tutto
  if (role === "Coordinator") {
    const { data, error } = await supabase
      .from("product_stock")
      .select("*");

    return Response.json({ data, error });
  }

  // Reception → solo il proprio salone
  const { data, error } = await supabase
    .from("product_stock")
    .select("*")
    .eq("salon_id", salon_id);

  return Response.json({ data, error });
}
