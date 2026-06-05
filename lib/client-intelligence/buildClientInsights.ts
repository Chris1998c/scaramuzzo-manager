/**
 * Rules engine per Client Intelligence.
 * Logica deterministica sui dati restituiti da getClientIntelligenceData.
 * Nessun LLM, nessun fetch esterno, nessuna modifica al DB.
 */

export type ClientIntelligencePayload = {
  profile: Record<string, unknown> | null;
  lastServiceCards: Array<{
    service_type?: string;
    data?: Record<string, unknown>;
    created_at?: string;
    [key: string]: unknown;
  }>;
  recentAppointments: Array<{
    start_time?: string;
    status?: string;
    notes?: string | null;
    [key: string]: unknown;
  }>;
  recentPurchases: {
    sales: Array<{ id?: number; date?: string; [key: string]: unknown }>;
    saleItems: Array<{
      service_id?: number | null;
      product_id?: number | null;
      [key: string]: unknown;
    }>;
  };
};

export type ClientInsightsResult = {
  summary: string[];
  warnings: string[];
  recommendedServices: string[];
  recommendedProducts: string[];
  suggestedActions: string[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_RECENT = 90;

// service_type da DB: oxidation, direct, botanicals, gloss, lightening, keratin, treatment
const COLOUR_TYPES = new Set(["oxidation", "direct", "lightening"]);
const GLOSS_TYPE = "gloss";
const TREATMENT_TYPES = new Set(["keratin", "treatment"]);
const BOTANICALS_TYPE = "botanicals";

// Soglie per le regole strutturate (Step 3A).
const PROCESSING_MINUTES_HIGH = 45;
const DEVELOPER_VOL_CAUTION = new Set([30, 40]);
const STRUCTURED_NOTE_MAX = 120;

function hasText(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/** Normalizza per deduplica: lowercase, trim, max length. */
function norm(s: string, maxLen = 200): string {
  return String(s).trim().toLowerCase().slice(0, maxLen);
}

/** Rimuove duplicati per normalizzazione, mantiene ordine. */
function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const key = norm(x);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function appointmentsInLastDays(
  appointments: ClientIntelligencePayload["recentAppointments"],
  days: number
): number {
  const cutoff = Date.now() - days * MS_PER_DAY;
  return appointments.filter((a) => {
    const t = a.start_time;
    if (!t) return false;
    const ts = new Date(t).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  }).length;
}

function hasRecentProductPurchases(
  saleItems: ClientIntelligencePayload["recentPurchases"]["saleItems"]
): boolean {
  return saleItems.some((i) => i.product_id != null);
}

function hasRecentServicePurchases(
  saleItems: ClientIntelligencePayload["recentPurchases"]["saleItems"]
): boolean {
  return saleItems.some((i) => i.service_id != null);
}

/** Tipi di servizio presenti nelle schede (normalizzati). */
function serviceTypesFromCards(
  cards: ClientIntelligencePayload["lastServiceCards"]
): string[] {
  const types = cards
    .map((c) => String(c.service_type ?? "").trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(types)];
}

/** Categoria prevalente dalle schede (conteggio per scheda, non per tipo unico). */
function dominantCategoryFromCards(
  cards: ClientIntelligencePayload["lastServiceCards"]
): "colore" | "gloss" | "trattamento" | "botanici" | null {
  if (cards.length === 0) return null;
  let colourCount = 0;
  let glossCount = 0;
  let treatmentCount = 0;
  let botanicalsCount = 0;
  for (const c of cards) {
    const t = String(c.service_type ?? "").trim().toLowerCase();
    if (COLOUR_TYPES.has(t)) colourCount++;
    else if (t === GLOSS_TYPE) glossCount++;
    else if (TREATMENT_TYPES.has(t)) treatmentCount++;
    else if (t === BOTANICALS_TYPE) botanicalsCount++;
  }
  const max = Math.max(colourCount, glossCount, treatmentCount, botanicalsCount);
  if (max === 0) return null;
  if (colourCount === max) return "colore";
  if (glossCount === max) return "gloss";
  if (treatmentCount === max) return "trattamento";
  if (botanicalsCount === max) return "botanici";
  return null;
}

/** Estrae testo nota/avvertenza da una scheda (un solo valore, il primo trovato). */
function getCardWarningText(card: { data?: Record<string, unknown>; service_type?: string }): string | null {
  const data = card.data && typeof card.data === "object" ? card.data : {};
  const note = data.notes ?? data.note ?? data.avvertenze ?? data.warning;
  if (!hasText(note)) return null;
  const type = String(card.service_type ?? "scheda").trim();
  const text = String(note).trim();
  const slice = text.length > 100 ? text.slice(0, 100) + "…" : text;
  return `[${type}] ${slice}`;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** payload moderno della scheda: card.data.payload. {} se assente. */
function cardPayloadOf(card: { data?: Record<string, unknown> }): Record<string, unknown> {
  const data = asObject(card.data);
  if (!data) return {};
  return asObject(data.payload) ?? {};
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function truncateNote(s: string): string {
  const t = s.trim();
  return t.length > STRUCTURED_NOTE_MAX ? `${t.slice(0, STRUCTURED_NOTE_MAX)}…` : t;
}

/**
 * Step 3A: legge i campi strutturati additivi delle schede
 * (payload.general_notes, payload.diagnosis, payload.color, payload.botanical_result).
 * Se i campi non esistono, non aggiunge nulla (comportamento invariato).
 * Nessuna formula inventata: usa solo i valori presenti.
 */
function applyStructuredCardRules(
  cards: ClientIntelligencePayload["lastServiceCards"],
  result: ClientInsightsResult,
): void {
  for (const card of cards) {
    const payload = cardPayloadOf(card);
    const typeLabel = String(card.service_type ?? "scheda").trim();

    // 1) Note moderne (payload.general_notes): oggi possono non emergere altrove.
    if (hasText(payload.general_notes)) {
      result.warnings.push(`[${typeLabel}] ${truncateNote(String(payload.general_notes))}`);
    }

    // 2) Diagnosi
    const diagnosis = asObject(payload.diagnosis);
    if (diagnosis) {
      const henna = String(diagnosis.prior_henna ?? "").trim();
      if (henna === "yes" || henna === "unknown") {
        result.warnings.push(
          "Henné/vegetali pregressi o non noti: cautela prima di colore chimico/ossidazione (valutare prova ciocca).",
        );
      }
      const box = String(diagnosis.prior_box_dye ?? "").trim();
      if (box === "yes" || box === "unknown") {
        result.warnings.push(
          "Tinta supermercato/box dye pregressa o non nota: valutare prova ciocca prima del servizio.",
        );
      }
      const patch = String(diagnosis.patch_test_result ?? "").trim();
      if (patch === "positive") {
        result.warnings.push("Patch test POSITIVO: non procedere senza valutazione.");
      } else if (patch === "not_done") {
        result.warnings.push("Patch test non eseguito: valutare prima del colore.");
      }
      const whitePct = String(diagnosis.white_pct_band ?? "").trim();
      if (whitePct === "50_75" || whitePct === "gt_75") {
        result.suggestedActions.push(
          "Bianchi elevati: pianificare gestione copertura / pre-pigmentazione.",
        );
      }
      const whiteRes = String(diagnosis.white_resistance ?? "").trim();
      if (whiteRes === "high") {
        result.suggestedActions.push(
          "Bianchi resistenti: valutare tempi di posa / pre-trattamento.",
        );
      }
    }

    // 3) Colore chimico (payload.color)
    const color = asObject(payload.color);
    if (color) {
      const tl = toNum(color.target_level);
      const al = toNum(color.achieved_level);
      const tt = String(color.target_tone ?? "").trim();
      const at = String(color.achieved_tone ?? "").trim();
      const levelDiff = tl != null && al != null && tl !== al;
      const toneDiff = tt !== "" && at !== "" && norm(tt) !== norm(at);
      if (levelDiff || toneDiff) {
        result.warnings.push(
          "Scostamento colore rispetto all'obiettivo: valutare correzione al prossimo servizio.",
        );
      }
      const dev = toNum(color.developer_vol);
      if (dev != null && DEVELOPER_VOL_CAUTION.has(dev)) {
        result.warnings.push(`Ossigeno elevato (${dev} vol): cautela su cute e integrità.`);
      }
      const minutes = toNum(color.processing_minutes);
      if (minutes != null && minutes > PROCESSING_MINUTES_HIGH) {
        result.warnings.push(`Tempo posa elevato (${minutes} min): verificare controllo posa.`);
      }
    }

    // 4) Botaniche / henné (payload.botanical_result) — separato dal colore chimico
    const botanical = asObject(payload.botanical_result);
    if (botanical) {
      const warm = String(botanical.warm_reflection ?? "").trim();
      if (warm === "medium" || warm === "strong") {
        result.suggestedActions.push("Riflesso caldo botaniche: valutare raffreddamento.");
      }
      const cool = String(botanical.cool_correction_needed ?? "").trim();
      if (cool === "yes") {
        result.suggestedActions.push("Raffreddamento richiesto (correzione botaniche).");
      }
      const coverage = String(botanical.coverage_result ?? "").trim();
      if (coverage === "low") {
        result.suggestedActions.push(
          "Copertura bianchi bassa (botaniche): rivedere protocollo copertura.",
        );
      }
    }
  }
}

export function buildClientInsights(payload: ClientIntelligencePayload | null): ClientInsightsResult {
  const result: ClientInsightsResult = {
    summary: [],
    warnings: [],
    recommendedServices: [],
    recommendedProducts: [],
    suggestedActions: [],
  };

  if (!payload) return result;

  const {
    profile,
    lastServiceCards,
    recentAppointments,
    recentPurchases,
  } = payload;

  const cards = Array.isArray(lastServiceCards) ? lastServiceCards : [];
  const appointments = Array.isArray(recentAppointments) ? recentAppointments : [];
  const sales = Array.isArray(recentPurchases?.sales) ? recentPurchases.sales : [];
  const saleItems = Array.isArray(recentPurchases?.saleItems) ? recentPurchases.saleItems : [];

  const countRecent = appointmentsInLastDays(appointments, DAYS_RECENT);
  const hasServices = hasRecentServicePurchases(saleItems);
  const hasProducts = hasRecentProductPurchases(saleItems);
  const cardTypes = serviceTypesFromCards(cards);
  const dominant = dominantCategoryFromCards(cards);

  // ——— SUMMARY ———
  if (countRecent >= 3) {
    result.summary.push("Cliente frequente (visite negli ultimi 90 giorni)");
  }
  if (cardTypes.length > 0) {
    result.summary.push(`Ultime schede: ${cardTypes.join(", ")}`);
  }
  if (dominant === "colore") {
    result.summary.push("Storico prevalentemente colore / ossidazione");
  } else if (dominant === "gloss") {
    result.summary.push("Storico gloss");
  } else if (dominant === "trattamento") {
    result.summary.push("Storico trattamenti / keratin");
  } else if (dominant === "botanici") {
    result.summary.push("Storico botanici");
  }
  if (appointments.length > 0 && cards.length === 0) {
    result.summary.push("Visite recenti senza schede tecniche");
  }
  if (sales.length > 0 && hasProducts) {
    result.summary.push("Acquisti retail recenti");
  }
  if (sales.length > 0 && hasServices && !hasProducts) {
    result.summary.push("Storico servizi in sala, nessun acquisto prodotto recente");
  }

  // ——— WARNINGS (raccolti poi deduplicati) ———
  if (profile && typeof profile === "object") {
    if (hasText(profile.allergies)) {
      result.warnings.push(`Allergie: ${String(profile.allergies).trim()}`);
    }
    if (hasText(profile.notes)) {
      const n = String(profile.notes).trim();
      result.warnings.push(n.length > 120 ? `Note profilo: ${n.slice(0, 120)}…` : `Note profilo: ${n}`);
    }
  }
  for (const card of cards) {
    const w = getCardWarningText(card);
    if (w) result.warnings.push(w);
  }
  // Step 3A: regole sui campi strutturati delle schede (note/diagnosi/colore/botaniche).
  applyStructuredCardRules(cards, result);
  result.warnings = dedupeStrings(result.warnings);

  // ——— RECOMMENDED SERVICES ———
  if (cardTypes.includes(GLOSS_TYPE)) {
    result.recommendedServices.push("Mantenimento gloss");
  }
  if (cardTypes.some((t) => COLOUR_TYPES.has(t))) {
    result.recommendedServices.push("Controllo colore / touch-up");
  }
  if (cardTypes.some((t) => TREATMENT_TYPES.has(t))) {
    result.recommendedServices.push("Trattamento di mantenimento");
  }
  if (cardTypes.includes(BOTANICALS_TYPE)) {
    result.recommendedServices.push("Mantenimento botanici");
  }
  if (appointments.length > 0 && cards.length === 0) {
    result.recommendedServices.push("Valutare analisi tecnica (scheda)");
  }
  if (cards.length === 0 && !hasServices && appointments.length === 0) {
    result.recommendedServices.push("Proposta consulenza tecnica");
  }

  // ——— RECOMMENDED PRODUCTS ———
  if (hasProducts) {
    result.recommendedProducts.push("Mantenimento domiciliare coerente con acquisti recenti");
    result.recommendedProducts.push("Continuità retail");
  }
  if (hasServices && !hasProducts && sales.length > 0) {
    result.recommendedProducts.push("Supporto post-servizio (domiciliare)");
  }

  // ——— SUGGESTED ACTIONS ———
  if (appointments.length === 0) {
    result.suggestedActions.push("Cliente senza visite recenti");
  }
  if (hasServices && !hasProducts && sales.length > 0) {
    result.suggestedActions.push("Valutare proposta mantenimento domiciliare");
  }
  if (appointments.length > 0 && cards.length === 0) {
    result.suggestedActions.push("Proporre scheda tecnica al prossimo appuntamento");
  }
  if (countRecent >= 3) {
    result.suggestedActions.push("Verificare soddisfazione (cliente fidelizzato)");
  }
  if (result.warnings.length > 0) {
    result.suggestedActions.push("Consultare avvertenze prima del servizio");
  }

  // Deduplica finale di tutte le liste
  result.summary = dedupeStrings(result.summary);
  result.recommendedServices = dedupeStrings(result.recommendedServices);
  result.recommendedProducts = dedupeStrings(result.recommendedProducts);
  result.suggestedActions = dedupeStrings(result.suggestedActions);

  return result;
}
