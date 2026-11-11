import type { SupabaseClient } from "@supabase/supabase-js";

export type AppointmentServiceLineAtomicPatch = {
  id: number;
  start_time?: string;
  /** Present even when null → clear staff assignment. */
  staff_id?: number | null;
  staff_id_set?: boolean;
};

export type AppointmentHeaderAtomicPatch = {
  customer_id?: string;
  notes?: string | null;
  start_time?: string;
  end_time?: string;
  staff_id?: number | null;
  staff_id_set?: boolean;
};

/**
 * Scrive più patch riga (+ optional header) in una sola transazione Postgres (RPC).
 * I controlli disponibilità/permessi devono essere già stati eseguiti dal caller.
 * Callable solo con service_role (REVOKE anon/authenticated).
 */
export async function patchAppointmentServiceLinesAtomic(
  supabase: SupabaseClient,
  args: {
    appointmentId: number;
    lines: AppointmentServiceLineAtomicPatch[];
    header?: AppointmentHeaderAtomicPatch | null;
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

  let headerPayload: Record<string, unknown> | null = null;
  if (args.header) {
    headerPayload = {};
    if (args.header.customer_id !== undefined) {
      headerPayload.customer_id = args.header.customer_id;
    }
    if (args.header.notes !== undefined) {
      headerPayload.notes = args.header.notes;
    }
    if (args.header.start_time !== undefined) {
      headerPayload.start_time = args.header.start_time;
    }
    if (args.header.end_time !== undefined) {
      headerPayload.end_time = args.header.end_time;
    }
    if (args.header.staff_id_set) {
      headerPayload.staff_id = args.header.staff_id ?? null;
    }
    if (!Object.keys(headerPayload).length) headerPayload = null;
  }

  const { error } = await supabase.rpc("patch_appointment_service_lines_atomic", {
    p_appointment_id: args.appointmentId,
    p_lines: payload,
    p_header: headerPayload,
  });

  if (error) {
    return { ok: false, error: new Error(error.message) };
  }
  return { ok: true };
}
