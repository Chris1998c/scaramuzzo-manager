// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const res = NextResponse.json({ success: true });

  res.cookies.set("sb-access-token", data.session!.access_token, {
    httpOnly: true,
    path: "/",
  });

  res.cookies.set("sb-refresh-token", data.session!.refresh_token, {
    httpOnly: true,
    path: "/",
  });

  return res;
}
