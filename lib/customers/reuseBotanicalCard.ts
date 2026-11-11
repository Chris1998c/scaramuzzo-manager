/**
 * Prefill “Riusa ultima scheda botanica”: solo campi tecnici del form corrente.
 * Non tocca goal/outcome/diagnosis/botanical_result né contesto visita (appointment/salon/staff).
 */

export const BOTANICAL_REUSE_TECHNICAL_KEYS = [
  "pre_direct",
  "mix",
  "heat",
  "processing_time",
  "rinse",
  /** R/L/P: scelta tecnica di zona; va sempre ricontrollata per la nuova visita. */
  "rlp",
] as const;

export type BotanicalReuseTechnicalKey = (typeof BOTANICAL_REUSE_TECHNICAL_KEYS)[number];

export type BotanicalCardLike = {
  id: string;
  service_type: string;
  created_at: string;
  data?: {
    kind?: string;
    payload?: Record<string, unknown> | null;
    created_local?: string;
  } | null;
};

export type BotanicalReuseTechnicalPayload = Partial<
  Record<BotanicalReuseTechnicalKey, string>
>;

const RLP_VALUES = new Set(["radice", "radice_lunghezze", "tutto"]);

function asNonEmptyString(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function cardTimestampMs(card: BotanicalCardLike): number {
  const t = Date.parse(card.created_at);
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/** Ultima scheda botanica per `created_at` (non la prima riga di un array già ordinato). */
export function pickLatestBotanicalCard(
  cards: BotanicalCardLike[],
): BotanicalCardLike | null {
  let best: BotanicalCardLike | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;

  for (const card of cards) {
    const isBotanical =
      card.service_type === "botanicals" || card.data?.kind === "botanicals";
    if (!isBotanical) continue;
    const ms = cardTimestampMs(card);
    if (ms > bestMs) {
      best = card;
      bestMs = ms;
      continue;
    }
    if (ms === bestMs && best && card.id > best.id) {
      best = card;
    }
  }

  return best;
}

export function extractBotanicalReuseTechnicalPayload(
  source: BotanicalCardLike,
): BotanicalReuseTechnicalPayload {
  const raw = source.data?.payload ?? {};
  const out: BotanicalReuseTechnicalPayload = {};

  for (const key of BOTANICAL_REUSE_TECHNICAL_KEYS) {
    if (key === "rlp") {
      const rlp = asNonEmptyString(raw.rlp);
      if (rlp && RLP_VALUES.has(rlp)) out.rlp = rlp;
      continue;
    }
    const v = asNonEmptyString(raw[key]);
    if (v !== undefined) out[key] = v;
  }

  return out;
}

/** True se il form corrente ha già valori nei campi che il riuso sovrascriverebbe. */
export function botanicalFormHasTechnicalContent(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  const p = payload ?? {};
  return BOTANICAL_REUSE_TECHNICAL_KEYS.some((key) => {
    const v = p[key];
    return v != null && String(v).trim() !== "";
  });
}

/**
 * Applica solo i campi tecnici riusabili sul payload botanico corrente.
 * Conserva goal/outcome/diagnosis/botanical_result/general_notes già presenti nel form.
 * Non importa mai quei campi (né date/id/appuntamento) dalla scheda sorgente.
 */
export function buildBotanicalPrefillFromReuse(input: {
  currentPayload?: Record<string, unknown> | null;
  technical: BotanicalReuseTechnicalPayload;
}): { kind: "botanicals"; payload: Record<string, unknown> } {
  const payload: Record<string, unknown> = { ...(input.currentPayload ?? {}) };

  for (const key of BOTANICAL_REUSE_TECHNICAL_KEYS) {
    delete payload[key];
  }
  for (const [key, value] of Object.entries(input.technical)) {
    if (value != null && String(value).trim() !== "") {
      payload[key] = value;
    }
  }

  return { kind: "botanicals", payload };
}

export function formatBotanicalReuseSourceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(d);
}

/** Campi esclusi dal riuso automatico (documentazione / assert nei test). */
export const BOTANICAL_REUSE_EXCLUDED_KEYS = [
  "goal",
  "outcome",
  "diagnosis",
  "botanical_result",
  "general_notes",
  "created_local",
  "id",
  "appointment_id",
  "salon_id",
  "staff_id",
] as const;
