// lib/supabaseServer.ts
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export async function createServerSupabase() {
  // In Next 15 cookies() è async
  const cookieStore = await cookies();

  const accessToken = cookieStore.get("sb-access-token")?.value || "";

  const headers: Record<string, string> = {};

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers,
      },
    }
  );
}
