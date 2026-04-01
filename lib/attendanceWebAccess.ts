import "server-only";

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";

export type AttendanceWebAccessOk = {
  ok: true;
  access: Awaited<ReturnType<typeof getUserAccess>>;
};

export type AttendanceWebAccessErr = {
  ok: false;
  response: NextResponse;
};

export type AttendanceWebAccess = AttendanceWebAccessOk | AttendanceWebAccessErr;

/** Presenze web: coordinator (nessun filtro salone) o reception (solo salone operativo = staffSalonId). */
export async function requireAttendanceWebAccess(): Promise<AttendanceWebAccess> {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non autenticato" }, { status: 401 }),
    };
  }

  const access = await getUserAccess();

  if (access.role === "cliente" || access.role === "magazzino") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non autorizzato" }, { status: 403 }),
    };
  }

  if (access.role !== "coordinator" && access.role !== "reception") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non autorizzato" }, { status: 403 }),
    };
  }

  return { ok: true, access };
}

/**
 * null = nessun filtro salone (coordinator).
 * array vuoto = nessun dato (reception senza salone operativo risolvibile).
 * [id] = reception: solo `staffSalonId` (stesso modello di ActiveSalonProvider / API reception).
 */
export function salonIdsForAttendanceFilter(
  access: Awaited<ReturnType<typeof getUserAccess>>,
): number[] | null {
  if (access.role === "coordinator") return null;
  if (access.role === "reception") {
    const sid = access.staffSalonId;
    if (sid != null && Number.isFinite(sid) && sid > 0) return [sid];
    return [];
  }
  return [];
}
