/**
 * GET utente corrente via cookie sessione SSR (`createServerSupabase`).
 * Il flusso UI Manager non dipende da questa route; utile per diagnosi o script leggeri.
 * Non è l’auth mobile Team (vedi `POST /api/mobile/login` + Bearer in `lib/mobileSession`).
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
    },
  });
}
