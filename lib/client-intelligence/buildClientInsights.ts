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
