import "server-only";

import { createClient, type User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabaseServer";

function getSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return { url, anonKey };
}

/** Estrae il token da `Authorization: Bearer <token>` (es. Supabase access_token da Expo). */
export function parseAuthorizationBearer(req: Request): string | null {
  const header = req.headers.get("authorization")?.trim();
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

export type GetAuthenticatedUserResult =
  | { ok: true; user: User }
  | { ok: false };

/**
 * Risolve l'utente Supabase Auth per API route:
 * 1) se presente `Authorization: Bearer`, valida il JWT con `auth.getUser(token)` (anon key, no service role);
 * 2) altrimenti sessione cookie SSR (dashboard / web Manager).
 */
export async function getAuthenticatedUserFromRequest(
  req: Request,
): Promise<GetAuthenticatedUserResult> {
  const bearer = parseAuthorizationBearer(req);

  if (bearer) {
    const { url, anonKey } = getSupabasePublicEnv();
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(bearer);
    if (error || !data.user) return { ok: false };
    return { ok: true, user: data.user };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false };
  return { ok: true, user: data.user };
}
