import {
  nowRomeLocalDate,
  parseLocal,
  snapToAgendaSlot,
  toNoZ,
} from "@/lib/agenda/agendaContract";
import { isoDateFromAgendaStartTime } from "@/lib/agenda/assertStaffSchedule";
import {
  MAX_CUSTOMER_APP_SERVICE_IDS,
  MAX_CUSTOMER_BOOKING_NOTES_LENGTH,
} from "@/lib/customer-app/customerAppLimits";
import { isPastCustomerAppDate } from "@/lib/customer-app/customerAppQuery";
import { parseCustomerAppSalonId } from "@/lib/customer-app/salonValidation";

export type ParsedCustomerAppBookingBody = {
  salonId: number;
  serviceIds: number[];
  staffId: number;
  startTime: string;
  notes: string | null;
};

export type ParseBookingBodyResult =
  | { ok: true; data: ParsedCustomerAppBookingBody }
  | { ok: false; error: string };

export function parseBookingServiceIds(raw: unknown): { ok: true; ids: number[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "service_ids obbligatorio" };
  }
  if (raw.length > MAX_CUSTOMER_APP_SERVICE_IDS) {
    return {
      ok: false,
      error: `service_ids: massimo ${MAX_CUSTOMER_APP_SERVICE_IDS} servizi`,
    };
  }

  const ids: number[] = [];
  for (const v of raw) {
    const n = typeof v === "number" ? v : Number(String(v).trim());
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, error: "service_id non valido" };
    }
    ids.push(n);
  }

  return { ok: true, ids };
}

function parseAgendaStartTime(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return null;
  }
  const parsed = parseLocal(s.length === 16 ? `${s}:00` : s);
  if (!Number.isFinite(parsed.getTime())) return null;
  return toNoZ(snapToAgendaSlot(parsed));
}

function isBookingStartInPast(startTime: string): boolean {
  const slotMs = parseLocal(startTime).getTime();
  const nowSnapped = snapToAgendaSlot(nowRomeLocalDate()).getTime();
  return slotMs < nowSnapped;
}

function parseNotes(raw: unknown): { ok: true; notes: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, notes: null };
  }
  const notes = String(raw).trim();
  if (!notes) return { ok: true, notes: null };
  if (notes.length > MAX_CUSTOMER_BOOKING_NOTES_LENGTH) {
    return { ok: false, error: `notes: massimo ${MAX_CUSTOMER_BOOKING_NOTES_LENGTH} caratteri` };
  }
  return { ok: true, notes };
}

export function parseCustomerAppBookingBody(body: unknown): ParseBookingBodyResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body JSON non valido" };
  }

  const record = body as Record<string, unknown>;

  const salonId = parseCustomerAppSalonId(record.salon_id);
  if (salonId === null) {
    return { ok: false, error: "salon_id non valido" };
  }

  const serviceIdsParsed = parseBookingServiceIds(record.service_ids);
  if (!serviceIdsParsed.ok) {
    return { ok: false, error: serviceIdsParsed.error };
  }

  const staffRaw = record.staff_id;
  const staffN = typeof staffRaw === "number" ? staffRaw : Number(String(staffRaw ?? "").trim());
  if (!Number.isInteger(staffN) || staffN <= 0) {
    return { ok: false, error: "staff_id obbligatorio e non valido" };
  }

  const startTime = parseAgendaStartTime(record.start_time);
  if (!startTime) {
    return { ok: false, error: "start_time non valido (formato YYYY-MM-DDTHH:MM:SS)" };
  }

  const isoDate = isoDateFromAgendaStartTime(startTime);
  if (!isoDate || isPastCustomerAppDate(isoDate)) {
    return { ok: false, error: "start_time non può essere nel passato" };
  }
  if (isBookingStartInPast(startTime)) {
    return { ok: false, error: "start_time non può essere nel passato" };
  }

  const notesParsed = parseNotes(record.notes);
  if (!notesParsed.ok) {
    return { ok: false, error: notesParsed.error };
  }

  return {
    ok: true,
    data: {
      salonId,
      serviceIds: serviceIdsParsed.ids,
      staffId: staffN,
      startTime,
      notes: notesParsed.notes,
    },
  };
}
