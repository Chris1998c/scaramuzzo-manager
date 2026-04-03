/**
 * Sistema colore Agenda / Cassa: tipo servizio → palette controllata (max 7).
 * Coerenza: stessa funzione ovunque (agenda, modali, cassa).
 */

export type ServiceVisualInput = {
  serviceName?: string | null;
  categoryName?: string | null;
};

/** 7 slot canonici (nessun random). */
export const AGENDA_SERVICE_PALETTE = {
  colorazione: "#c9a227",
  taglio: "#94a3b8",
  trattamento: "#14b8a6",
  schiariture: "#818cf8",
  styling: "#fb923c",
  piega: "#c084fc",
  default: "#a8754f",
} as const;

export type AgendaPaletteKey = keyof typeof AGENDA_SERVICE_PALETTE;

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/** Mappa nome categoria o servizio → chiave palette (parole IT/EN). */
export function resolveAgendaPaletteKey(input: ServiceVisualInput): AgendaPaletteKey {
  const cat = input.categoryName ? norm(String(input.categoryName)) : "";
  const svc = input.serviceName ? norm(String(input.serviceName)) : "";
  const hay = [cat, svc].filter(Boolean).join(" | ");

  if (!hay) return "default";

  const order: { key: AgendaPaletteKey; re: RegExp }[] = [
    {
      key: "colorazione",
      re: /color|colour|tinta|tinto|colore|meches|meche|decolor|rifless|raccol|tonal|shampoo.?tinta|patch|henn/,
    },
    {
      key: "schiariture",
      re: /schiar|bleach|balayage|ombr|airtouch|platin|chiar|carta|foli|highlights|schiuma|super.?blond/,
    },
    { key: "taglio", re: /taglio|cut|scalp|barber|barba|punta|rasto|forbici/ },
    {
      key: "trattamento",
      re: /trattament|kerat|ricostr|rigen|nutri|ristrutt|repair|maschera|botox.?cap|ossigen|reconstruction|therapy/,
    },
    { key: "piega", re: /piega|phono|phon|asciug|brush|ceppi|finish.?piega|blower/ },
    {
      key: "styling",
      re: /styling|style|moss|lisci|sleek|ondul|wavy|taylor|updo|raccolto.?cer|trecce|dread|crespo|curl|diffus/,
    },
  ];

  for (const { key, re } of order) {
    if (re.test(hay)) return key;
  }

  if (cat) {
    if (/taglio|cut/.test(cat)) return "taglio";
    if (/trattament|kerat/.test(cat)) return "trattamento";
    if (/color|tinta/.test(cat)) return "colorazione";
    if (/styl|piega|finish/.test(cat)) return "styling";
    if (/schiar/.test(cat)) return "schiariture";
  }

  return "default";
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (/^[0-9a-f]{6}$/i.test(h)) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number) {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export type AgendaServiceVisual = {
  paletteKey: AgendaPaletteKey;
  accent: string;
  tintBg: string;
  accentLuminance: number;
  /** Card tema scuro: testo sempre chiaro; meta leggermente più forte se accento molto luminoso */
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
};

/**
 * Risolve aspetto visivo: nome categoria + nome servizio (keyword).
 * Palette controllata; niente color_code casuale.
 */
export function resolveAgendaServiceVisual(input: ServiceVisualInput): AgendaServiceVisual {
  const paletteKey = resolveAgendaPaletteKey(input);
  const accent = AGENDA_SERVICE_PALETTE[paletteKey];
  const rgb = parseHex(accent);
  const lum = rgb ? relativeLuminance(rgb.r, rgb.g, rgb.b) : 0.35;
  const alphaTint = lum > 0.62 ? 0.11 : 0.16;
  const tintBg = rgb
    ? `rgba(${rgb.r},${rgb.g},${rgb.b},${alphaTint})`
    : "rgba(168,117,79,0.16)";

  const textPrimary = "#f3d8b6";
  const textSecondary = "rgba(255,255,255,0.9)";
  const textMuted = lum > 0.62 ? "rgba(255,255,255,0.76)" : "rgba(255,255,255,0.58)";

  return {
    paletteKey,
    accent,
    tintBg,
    accentLuminance: lum,
    textPrimary,
    textSecondary,
    textMuted,
  };
}

/** Input da riga nested Supabase `services` + `service_categories`. */
export function agendaVisualFromServiceRow(service: any): AgendaServiceVisual {
  const categoryName =
    service?.service_categories?.name ??
    (Array.isArray(service?.service_categories)
      ? service?.service_categories[0]?.name
      : null);
  return resolveAgendaServiceVisual({
    categoryName,
    serviceName: service?.name,
  });
}
