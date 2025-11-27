import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  // FIX 1: createServerSupabase è async → serve await
  const supabase = await createServerSupabase();

  // Body request
  const { salon_id } = await req.json();

  if (salon_id === undefined || salon_id === null) {
    return NextResponse.json({ error: "Missing salon_id" }, { status: 400 });
  }

  // Ottieni l'utente loggato
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const role = user.user_metadata?.role;

  // Solo coordinator o magazzino possono cambiare salone
  if (role !== "coordinator" && role !== "magazzino") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  // FIX 2: updateUser va fatto così
  const { error } = await supabase.auth.updateUser({
    data: { salon_id },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
