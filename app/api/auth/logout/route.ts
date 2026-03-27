// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

export async function POST() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });

  // Cleanup defensivo: elimina anche i cookie legacy/custom.
  const cookieNames = [
    "sb-access-token",
    "sb-refresh-token",
    ...response.cookies.getAll().map((c) => c.name),
  ];

  for (const name of cookieNames) {
    if (name.startsWith("sb-")) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
  }

  return response;
}
