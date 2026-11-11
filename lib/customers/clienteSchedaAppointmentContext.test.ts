import { describe, expect, it } from "vitest";
import {
  buildClienteSchedeTecnicheHref,
  parseAppointmentIdSearchParam,
  resolveClienteSchedaAppointmentContext,
  type AppointmentContextRow,
} from "@/lib/customers/clienteSchedaAppointmentContext";

const CUSTOMER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CUSTOMER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const appt = (
  partial: Partial<AppointmentContextRow> & Pick<AppointmentContextRow, "id">,
): AppointmentContextRow => ({
  customer_id: CUSTOMER_A,
  salon_id: 1,
  staff_id: 10,
  ...partial,
});

describe("buildClienteSchedeTecnicheHref", () => {
  it("include appointment_id e hash schede-tecniche, senza salon/staff in URL", () => {
    const href = buildClienteSchedeTecnicheHref(CUSTOMER_A, 42);
    expect(href).toBe(
      `/dashboard/clienti/${CUSTOMER_A}?appointment_id=42#schede-tecniche`,
    );
    expect(href).not.toMatch(/salon_id|staff_id/);
  });
});

describe("parseAppointmentIdSearchParam", () => {
  it("assenza parametro → percorso senza appuntamento", () => {
    expect(parseAppointmentIdSearchParam(undefined)).toEqual({
      present: false,
      appointmentId: null,
    });
    expect(parseAppointmentIdSearchParam("")).toEqual({
      present: false,
      appointmentId: null,
    });
  });

  it("ID non valido resta present ma null", () => {
    expect(parseAppointmentIdSearchParam("abc")).toEqual({
      present: true,
      appointmentId: null,
    });
    expect(parseAppointmentIdSearchParam("0")).toEqual({
      present: true,
      appointmentId: null,
    });
  });

  it("ID valido", () => {
    expect(parseAppointmentIdSearchParam("99")).toEqual({
      present: true,
      appointmentId: 99,
    });
  });
});

describe("resolveClienteSchedaAppointmentContext", () => {
  const access = {
    role: "coordinator",
    allowedSalonIds: [1, 2],
    staffSalonId: 1 as number | null,
  };

  it("senza appointment_id → none (scheda cliente normale)", () => {
    expect(
      resolveClienteSchedaAppointmentContext({
        pageCustomerId: CUSTOMER_A,
        requested: { present: false, appointmentId: null },
        appointment: null,
        ...access,
      }),
    ).toEqual({ status: "none" });
  });

  it("contesto valido: passa appointment/salon/staff dall’appuntamento", () => {
    const result = resolveClienteSchedaAppointmentContext({
      pageCustomerId: CUSTOMER_A,
      requested: { present: true, appointmentId: 42 },
      appointment: appt({ id: 42, staff_id: 7 }),
      ...access,
    });
    expect(result).toEqual({
      status: "ok",
      context: { appointmentId: 42, salonId: 1, staffId: 7 },
    });
  });

  it("cliente diverso → error senza contesto", () => {
    const result = resolveClienteSchedaAppointmentContext({
      pageCustomerId: CUSTOMER_B,
      requested: { present: true, appointmentId: 42 },
      appointment: appt({ id: 42, customer_id: CUSTOMER_A }),
      ...access,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/non appartiene/);
    }
  });

  it("ID inesistente / non accessibile → error", () => {
    const result = resolveClienteSchedaAppointmentContext({
      pageCustomerId: CUSTOMER_A,
      requested: { present: true, appointmentId: 999 },
      appointment: null,
      ...access,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/non trovato|non accessibile/);
    }
  });

  it("ID non valido in query → error", () => {
    const result = resolveClienteSchedaAppointmentContext({
      pageCustomerId: CUSTOMER_A,
      requested: { present: true, appointmentId: null },
      appointment: null,
      ...access,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/non valido/);
    }
  });

  it("reception: salone diverso → error", () => {
    const result = resolveClienteSchedaAppointmentContext({
      pageCustomerId: CUSTOMER_A,
      requested: { present: true, appointmentId: 42 },
      appointment: appt({ id: 42, salon_id: 2 }),
      role: "reception",
      allowedSalonIds: [1],
      staffSalonId: 1,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/saloni consentiti/);
    }
  });

  it("reception: stesso salone → ok", () => {
    const result = resolveClienteSchedaAppointmentContext({
      pageCustomerId: CUSTOMER_A,
      requested: { present: true, appointmentId: 42 },
      appointment: appt({ id: 42, salon_id: 1, staff_id: null }),
      role: "reception",
      allowedSalonIds: [1],
      staffSalonId: 1,
    });
    expect(result).toEqual({
      status: "ok",
      context: { appointmentId: 42, salonId: 1, staffId: null },
    });
  });
});
