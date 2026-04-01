/**
 * @deprecated Login web ufficiale del Manager: `app/login/page.tsx` → `supabase.auth.signInWithPassword`
 * sul browser client (`lib/supabaseClient`); middleware legge la sessione Supabase SSR standard.
 *
 * Questo POST resta solo per compatibilità con integrazioni che si aspettano cookie `sb-access-token` /
 * `sb-refresh-token` (custom). Non aggiungere nuove dipendenze. Risposta include `X-SM-API-Class`.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const LEGACY_AUTH_HEADER = "legacy-web-auth-cookie-login";

function markLegacyAuth(res: NextResponse): NextResponse {
  res.headers.set("X-SM-API-Class", LEGACY_AUTH_HEADER);
  return res;
}

export async function POST(req: Request) {
  const { email, password } = await req.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    return markLegacyAuth(
      NextResponse.json(
        { error: error?.message || "Credenziali non valide" },
        { status: 400 }
      )
    );
  }

  const { access_token, refresh_token } = data.session;

  const res = markLegacyAuth(NextResponse.json({ success: true }));

  // Cookie compatibili con middleware e server
  res.cookies.set("sb-access-token", access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 giorni
  });

  res.cookies.set("sb-refresh-token", refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // ~30 giorni
  });

  return res;
}
