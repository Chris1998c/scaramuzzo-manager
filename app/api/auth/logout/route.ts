// app/api/auth/logout/route.ts
// Logout web ufficiale (header Manager): invalida la sessione Supabase SSR sulla Response.
// Pulisce anche i cookie `sb-access-token` / `sb-refresh-token` se impostati da POST /api/auth/login (legacy compat).
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();

  const response = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  await supabase.auth.signOut();

  // Legacy compat: stessi nomi eventualmente usati da POST /api/auth/login (non dalla login page Manager).
  response.cookies.set("sb-access-token", "", { path: "/", maxAge: 0 });
  response.cookies.set("sb-refresh-token", "", { path: "/", maxAge: 0 });

  return response;
}
