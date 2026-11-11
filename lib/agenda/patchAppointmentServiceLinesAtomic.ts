import type { SupabaseClient } from "@supabase/supabase-js";

export type AppointmentServiceLineAtomicPatch = {
  id: number;
  start_time?: string;
  /** Present even when null → clear staff assignment. */
  staff_id?: number | null;
  staff_id_set?: boolean;
};

/**
 * Scrive più patch riga in una sola transazione Postgres (RPC).
 * I controlli disponibilità/permessi devono essere già stati eseguiti dal caller.
 */
export async function patchAppointmentServiceLinesAtomic(
  supabase: SupabaseClient,
  args: {
    appointmentId: number;
    lines: AppointmentServiceLineAtomicPatch[];
  },
): Promise<{ ok: true } | { ok: false; error: Error }> {
  if (!Number.isFinite(args.appointmentId) || args.appointmentId <= 0) {
    return { ok: false, error: new Error("appointmentId non valido") };
  }
  if (!args.lines.length) return { ok: true };

  const payload = args.lines.map((l) => {
    const row: Record<string, unknown> = { id: l.id };
    if (l.start_time !== undefined) row.start_time = l.start_time;
    if (l.staff_id_set) row.staff_id = l.staff_id ?? null;
    return row;
  });

  const { error } = await supabase.rpc("patch_appointment_service_lines_atomic", {
    p_appointment_id: args.appointmentId,
    p_lines: payload,
  });

  if (error) {
    return { ok: false, error: new Error(error.message) };
  }
  return { ok: true };
}
