/**
 * Deep link Agenda → scheda tecnica: valida appointment_id rispetto al cliente
 * e ai saloni consentiti. salon_id/staff_id derivano solo dall'appuntamento verificato.
 */

export type VerifiedSchedaAppointmentContext = {
  appointmentId: number;
  salonId: number;
  staffId: number | null;
};

export type ResolveClienteSchedaAppointmentResult =
  | { status: "none" }
  | { status: "ok"; context: VerifiedSchedaAppointmentContext }
  | { status: "error"; message: string };

export type AppointmentContextRow = {
  id: number;
  customer_id: string | null;
  salon_id: number | null;
  staff_id: number | null;
};

/** URL Agenda → scheda tecnica con ID appuntamento (salon/staff NON in query). */
export function buildClienteSchedeTecnicheHref(
  customerId: string,
  appointmentId: number,
): string {
  return `/dashboard/clienti/${customerId}?appointment_id=${appointmentId}#schede-tecniche`;
}

export function parseAppointmentIdSearchParam(
  raw: string | string[] | undefined | null,
): { present: boolean; appointmentId: number | null } {
  if (raw == null) return { present: false, appointmentId: null };
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v == null || String(v).trim() === "") {
    return { present: false, appointmentId: null };
  }
  const n = Number(String(v).trim());
  if (!Number.isInteger(n) || n <= 0) {
    return { present: true, appointmentId: null };
  }
  return { present: true, appointmentId: n };
}

function canAccessAppointmentSalon(input: {
  role: string;
  salonId: number;
  allowedSalonIds: number[];
  staffSalonId: number | null;
}): boolean {
  if (input.role === "reception") {
    return (
      input.staffSalonId != null &&
      Number(input.staffSalonId) === input.salonId
    );
  }
  return input.allowedSalonIds.includes(input.salonId);
}

/**
 * Pure validation used by the customer page (and unit tests).
 * - no appointment param → none (CRM / scheda senza associazione)
 * - invalid / missing / wrong customer / no salon access → error, no context
 * - match → ok with salon_id/staff_id from the appointment row
 */
export function resolveClienteSchedaAppointmentContext(input: {
  pageCustomerId: string;
  requested: { present: boolean; appointmentId: number | null };
  appointment: AppointmentContextRow | null;
  role: string;
  allowedSalonIds: number[];
  staffSalonId: number | null;
}): ResolveClienteSchedaAppointmentResult {
  const { requested } = input;
  if (!requested.present) return { status: "none" };

  if (requested.appointmentId == null) {
    return {
      status: "error",
      message:
        "ID appuntamento non valido: la scheda tecnica resta senza collegamento all’appuntamento.",
    };
  }

  if (!input.appointment) {
    return {
      status: "error",
      message:
        "Appuntamento non trovato o non accessibile: la scheda tecnica resta senza collegamento all’appuntamento.",
    };
  }

  if (String(input.appointment.customer_id ?? "") !== String(input.pageCustomerId)) {
    return {
      status: "error",
      message:
        "L’appuntamento non appartiene a questo cliente: la scheda tecnica resta senza collegamento all’appuntamento.",
    };
  }

  const salonId = Number(input.appointment.salon_id);
  if (!Number.isInteger(salonId) || salonId <= 0) {
    return {
      status: "error",
      message:
        "Appuntamento senza salone valido: la scheda tecnica resta senza collegamento all’appuntamento.",
    };
  }

  if (
    !canAccessAppointmentSalon({
      role: input.role,
      salonId,
      allowedSalonIds: input.allowedSalonIds,
      staffSalonId: input.staffSalonId,
    })
  ) {
    return {
      status: "error",
      message:
        "Appuntamento fuori dai saloni consentiti: la scheda tecnica resta senza collegamento all’appuntamento.",
    };
  }

  const rawStaff = input.appointment.staff_id;
  const staffNum = rawStaff == null ? null : Number(rawStaff);
  const staffId =
    staffNum != null && Number.isInteger(staffNum) && staffNum > 0 ? staffNum : null;

  return {
    status: "ok",
    context: {
      appointmentId: Number(input.appointment.id),
      salonId,
      staffId,
    },
  };
}
