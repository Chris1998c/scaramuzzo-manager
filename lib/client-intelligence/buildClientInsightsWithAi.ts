import "server-only";
import {
  buildClientInsights,
  type ClientIntelligencePayload,
  type ClientInsightsResult,
} from "@/lib/client-intelligence/buildClientInsights";

/**
 * Wrapper LLM (server-only) per arricchire gli insights cliente.
 *
 * Garanzie:
 * - Non cambia il contratto ClientInsightsResult.
 * - Calcola SEMPRE prima il fallback deterministico (buildClientInsights).
 * - Se OPENAI_API_KEY manca, l'output non è valido, va in timeout o la rete
 *   fallisce, ritorna il fallback deterministico.
 * - Minimizza i dati inviati a OpenAI ed esclude esplicitamente telefono/email.
 * - Nessuna scrittura DB, nessuna azione automatica.
 *
 * Riusa il pattern OpenAI di app/api/marketing/ai-copy-assist/route.ts
 * (fetch nativo a chat/completions, env-gated, fail-closed).
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
// Stesso default modello usato da ai-copy-assist.
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 8000;
const MAX_ITEMS_PER_FIELD = 6;
const MAX_CHARS_PER_ITEM = 160;
const MAX_NOTE_CHARS = 120;

const INSIGHT_KEYS = [
  "summary",
  "warnings",
  "recommendedServices",
  "recommendedProducts",
  "suggestedActions",
] as const;

type InsightKey = (typeof INSIGHT_KEYS)[number];

/** Chiavi da non inviare mai a OpenAI (PII / contatti / identificatori). */
const FORBIDDEN_KEY_RE = /(phone|tel|cell|mobile|email|mail|first_name|last_name|customer_id|address|indirizzo|codice_fiscale)/i;

function hasText(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

function emptyResult(): ClientInsightsResult {
  return {
    summary: [],
    warnings: [],
    recommendedServices: [],
    recommendedProducts: [],
    suggestedActions: [],
  };
}

/** Normalizza per deduplica mantenendo l'ordine. */
function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const key = raw.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
  }
  return out;
}

/** Coerce un valore arbitrario in array di stringhe pulite e limitate. */
function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .filter((v) => typeof v === "string")
    .map((v) => (v as string).trim())
    .filter((v) => v.length > 0)
    .map((v) => (v.length > MAX_CHARS_PER_ITEM ? v.slice(0, MAX_CHARS_PER_ITEM).trimEnd() : v));
  return dedupeStrings(cleaned).slice(0, MAX_ITEMS_PER_FIELD);
}

function isEmptyInsights(r: ClientInsightsResult): boolean {
  return INSIGHT_KEYS.every((k) => r[k].length === 0);
}

/** Profilo capelli sanitizzato: solo attributi tecnici + allergie/note, nessuna PII. */
function minimizeProfile(profile: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!profile || typeof profile !== "object") return null;
  const allow = [
    "texture",
    "thickness",
    "density",
    "porosity",
    "elasticity",
    "scalp",
    "frizz_level",
    "baseline_level",
    "allergies",
    "notes",
  ];
  const out: Record<string, unknown> = {};
  for (const key of allow) {
    if (FORBIDDEN_KEY_RE.test(key)) continue;
    const v = (profile as Record<string, unknown>)[key];
    if (v == null) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (t) out[key] = t.length > MAX_NOTE_CHARS ? `${t.slice(0, MAX_NOTE_CHARS)}…` : t;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[key] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Estrae una nota/avvertenza breve da una scheda, se presente. */
function cardNote(card: { data?: Record<string, unknown> }): string | null {
  const data = card.data && typeof card.data === "object" ? card.data : {};
  const note = data.notes ?? data.note ?? data.avvertenze ?? data.warning;
  if (!hasText(note)) return null;
  const t = String(note).trim();
  return t.length > MAX_NOTE_CHARS ? `${t.slice(0, MAX_NOTE_CHARS)}…` : t;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Costruisce un contesto minimizzato e privo di PII a partire dal payload.
 * Aggrega dove possibile per ridurre la superficie dati inviata.
 */
function minimizeContext(payload: ClientIntelligencePayload): Record<string, unknown> {
  const cards = Array.isArray(payload.lastServiceCards) ? payload.lastServiceCards : [];
  const appointments = Array.isArray(payload.recentAppointments) ? payload.recentAppointments : [];
  const sales = Array.isArray(payload.recentPurchases?.sales) ? payload.recentPurchases.sales : [];
  const saleItems = Array.isArray(payload.recentPurchases?.saleItems)
    ? payload.recentPurchases.saleItems
    : [];

  const now = Date.now();
  const statuses: Record<string, number> = {};
  let last90Days = 0;
  for (const a of appointments) {
    const status = String(a.status ?? "unknown").trim().toLowerCase() || "unknown";
    statuses[status] = (statuses[status] ?? 0) + 1;
    const ts = a.start_time ? new Date(a.start_time).getTime() : NaN;
    if (Number.isFinite(ts) && ts >= now - 90 * MS_PER_DAY) last90Days += 1;
  }

  const serviceCards = cards.map((c) => {
    const entry: Record<string, unknown> = {
      service_type: String(c.service_type ?? "").trim().toLowerCase() || "unknown",
    };
    const note = cardNote(c);
    if (note) entry.note = note;
    return entry;
  });

  return {
    profile: minimizeProfile(payload.profile ?? null),
    serviceCards,
    appointments: {
      total: appointments.length,
      last90Days,
      statuses,
    },
    purchases: {
      salesCount: sales.length,
      hasServices: saleItems.some((i) => i.service_id != null),
      hasProducts: saleItems.some((i) => i.product_id != null),
    },
  };
}

function buildSystemPrompt(): string {
  return [
    "Sei un assistente tecnico per saloni di bellezza di livello alto in Italia.",
    "Analizzi dati anonimizzati di un cliente per produrre insight operativi per lo staff.",
    "Usa SOLO i dati forniti nel contesto: non inventare informazioni personali, anagrafiche, contatti o storici non presenti.",
    "Non aggiungere claim medici, diagnosi, claim legali o sanitari.",
    "Scrivi in italiano, frasi brevi e professionali.",
    "Rispondi ESCLUSIVAMENTE con un oggetto JSON valido con esattamente queste 5 chiavi, ognuna array di stringhe:",
    '"summary", "warnings", "recommendedServices", "recommendedProducts", "suggestedActions".',
    `Ogni array al massimo ${MAX_ITEMS_PER_FIELD} elementi; ogni stringa breve (max ${MAX_CHARS_PER_ITEM} caratteri).`,
    "In \"warnings\" riporta sempre eventuali allergie o avvertenze presenti nei dati.",
    "Se un campo non ha contenuti pertinenti, usa un array vuoto. Nessun testo fuori dal JSON.",
  ].join(" ");
}

function buildUserPrompt(context: Record<string, unknown>, baseline: ClientInsightsResult): string {
  return [
    "Contesto cliente (dati anonimizzati, nessun contatto personale):",
    JSON.stringify(context),
    "",
    "Insight di riferimento già calcolati da regole deterministiche (puoi migliorarli/riorganizzarli, restando coerente con i dati):",
    JSON.stringify(baseline),
    "",
    "Produci il JSON finale con le 5 chiavi richieste.",
  ].join("\n");
}

function parseInsightsFromContent(content: string): ClientInsightsResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const obj = parsed as Record<string, unknown>;
  const result = emptyResult();
  for (const key of INSIGHT_KEYS) {
    result[key as InsightKey] = sanitizeStringArray(obj[key]);
  }
  return result;
}

/**
 * Ritorna insight cliente potenzialmente arricchiti da OpenAI, con fallback
 * deterministico garantito. Output sempre compatibile con ClientInsightsResult.
 */
export async function buildClientInsightsWithAi(
  payload: ClientIntelligencePayload | null,
): Promise<ClientInsightsResult> {
  const fallback = buildClientInsights(payload);

  if (!payload) return fallback;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return fallback;

  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const context = minimizeContext(payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 500,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(context, fallback) },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[client-intelligence/ai] openai http", res.status);
      return fallback;
    }

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const choices = json?.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content;
    if (!hasText(content)) return fallback;

    const aiResult = parseInsightsFromContent(String(content));
    if (!aiResult || isEmptyInsights(aiResult)) return fallback;

    // Safety net: non perdere mai avvertenze deterministiche (es. allergie).
    aiResult.warnings = dedupeStrings([...fallback.warnings, ...aiResult.warnings]).slice(
      0,
      MAX_ITEMS_PER_FIELD,
    );

    return aiResult;
  } catch (e) {
    console.error("[client-intelligence/ai]", e);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
