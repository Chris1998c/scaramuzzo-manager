import { resolveAgendaPaletteKey } from "@/lib/agendaServiceVisual";

/** Tipi scheda tecnica colore (escluso legacy_note). */
export const BASE_COLOR_CARD_TYPES = [
  "oxidation_color",
  "direct_color",
  "oxidation",
  "direct",
  "gloss",
] as const;

export const LIGHTENING_CARD_TYPES = ["lightening"] as const;

export const COLOR_CARD_TYPES = [
  ...BASE_COLOR_CARD_TYPES,
  ...LIGHTENING_CARD_TYPES,
] as const;

export type ColorCardType = (typeof COLOR_CARD_TYPES)[number];

export const BASE_COLOR_ABSENT_DAYS = 45;
export const LIGHTENING_ABSENT_DAYS = 70;

export const COLOR_ABSENT_ALERT_MIN = 3;

export type ColorAbsentCustomer = {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  last_color_label: string;
  days_absent: number;
  threshold_days: number;
  detail: string;
};

export function isColorCardType(serviceType: string): boolean {
  return (COLOR_CARD_TYPES as readonly string[]).includes(serviceType);
}

export function isLighteningCardType(serviceType: string): boolean {
  return (LIGHTENING_CARD_TYPES as readonly string[]).includes(serviceType);
}

export function colorAbsentThresholdDays(hasLighteningHistory: boolean): number {
  return hasLighteningHistory ? LIGHTENING_ABSENT_DAYS : BASE_COLOR_ABSENT_DAYS;
}

export function isColorAppointmentService(
  serviceName: string | null | undefined,
  categoryName: string | null | undefined,
): boolean {
  const key = resolveAgendaPaletteKey({
    serviceName: serviceName ?? null,
    categoryName: categoryName ?? null,
  });
  return key === "colorazione" || key === "schiariture";
}

export function diffDaysFromNow(isoDate: string, nowMs = Date.now()): number {
  const ms = new Date(isoDate).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((nowMs - ms) / 86_400_000));
}

export type ColorAbsentEvaluateInput = {
  customerId: string;
  customerName: string;
  phone: string | null;
  hasLighteningHistory: boolean;
  lastCardAt: string | null;
  lastColorAppointmentAt: string | null;
  nowMs?: number;
};

/** Valuta se il cliente rientra nel segmento colore assenti. */
export function evaluateColorAbsentCustomer(
  input: ColorAbsentEvaluateInput,
): ColorAbsentCustomer | null {
  const threshold = colorAbsentThresholdDays(input.hasLighteningHistory);
  const nowMs = input.nowMs ?? Date.now();

  const lastColorMs = input.lastColorAppointmentAt
    ? new Date(input.lastColorAppointmentAt).getTime()
    : null;
  const lastCardMs = input.lastCardAt ? new Date(input.lastCardAt).getTime() : null;

  const referenceIso =
    input.lastColorAppointmentAt ??
    input.lastCardAt ??
    null;

  if (!referenceIso) return null;

  const referenceMs = new Date(referenceIso).getTime();
  if (!Number.isFinite(referenceMs)) return null;

  const daysAbsent = diffDaysFromNow(referenceIso, nowMs);
  if (daysAbsent < threshold) return null;

  let lastColorLabel: string;
  if (lastColorMs != null && Number.isFinite(lastColorMs)) {
    lastColorLabel = new Date(lastColorMs).toLocaleDateString("it-IT");
  } else if (lastCardMs != null && Number.isFinite(lastCardMs)) {
    lastColorLabel = `${new Date(lastCardMs).toLocaleDateString("it-IT")} (scheda)`;
  } else {
    lastColorLabel = "Non disponibile";
  }

  const detail =
    input.lastColorAppointmentAt == null
      ? `Nessun appuntamento colore in agenda · ultima scheda ${lastColorLabel}`
      : `Ultimo colore ${lastColorLabel} · ${daysAbsent} giorni fa`;

  return {
    customer_id: input.customerId,
    customer_name: input.customerName,
    phone: input.phone,
    last_color_label: lastColorLabel,
    days_absent: daysAbsent,
    threshold_days: threshold,
    detail,
  };
}
