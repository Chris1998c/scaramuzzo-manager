/**
 * Classificazione conservativa per note tecniche Boss (dry-run / audit).
 * Non interpreta aggressivamente formule libere.
 */

export type ServiceTypeGuess =
  | "lightening"
  | "direct_color"
  | "botanicals"
  | "oxidation_color"
  | "keratin"
  | "legacy_note"
  | "mixed_legacy";

export type Confidence = "high" | "medium" | "low";

export type BossTechnicalCardsColumnIndices = {
  nominativo: number;
  telefono: number;
  cellulare: number;
  altroTelefono: number;
  email: number;
  altraEmail: number;
  noteTecnicheBase: number;
  consigli: number;
  data: number;
  tipoNota: number;
  noteTecnicheAvanzate: number;
};

export type ClassificationResult = {
  serviceType: ServiceTypeGuess;
  confidence: Confidence;
  warnings: string[];
  oxygenVolume: number | null;
  /** Segnali rilevati (audit). */
  signals: string[];
  combinedText: string;
  originalParts: {
    noteTecnicheBase: string;
    consigli: string;
    noteTecnicheAvanzate: string;
  };
};

export function resolveBossTechnicalCardsColumns(
  headers: string[],
): BossTechnicalCardsColumnIndices {
  const find = (...names: string[]) => {
    const normalized = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
    for (const name of names) {
      const idx = normalized.indexOf(name.trim().toLowerCase().replace(/\s+/g, " "));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  return {
    nominativo: find("nominativo"),
    telefono: find("telefono"),
    cellulare: find("cellulare"),
    altroTelefono: find("altrotelefono", "altro telefono"),
    email: find("email"),
    altraEmail: find("altraemail", "altra email"),
    noteTecnicheBase: find("notetecnichebase", "note tecniche base"),
    consigli: find("consigli"),
    data: find("data"),
    tipoNota: find("tiponota", "tipo nota"),
    noteTecnicheAvanzate: find("notetecnicheavanzate", "note tecniche avanzate"),
  };
}

export function combineBossTechnicalNoteText(parts: {
  noteTecnicheBase: string;
  consigli: string;
  noteTecnicheAvanzate: string;
}): string {
  const blocks = [parts.noteTecnicheBase, parts.consigli, parts.noteTecnicheAvanzate].filter(
    (t) => t.trim() !== "",
  );
  return blocks.join("\n---\n");
}

/** Testo Boss invariato per import legacy (solo \\n tra blocchi). */
export function bossTechnicalNoteOriginalText(parts: {
  noteTecnicheBase: string;
  consigli: string;
  noteTecnicheAvanzate: string;
}): string {
  return [parts.noteTecnicheBase, parts.consigli, parts.noteTecnicheAvanzate]
    .filter((t) => t.trim() !== "")
    .map((t) => t.replace(/\r\n/g, "\n"))
    .join("\n");
}

export function parseBossLegacyDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const day = m[1]!.padStart(2, "0");
  const month = m[2]!.padStart(2, "0");
  const year = m[3]!;
  return `${year}-${month}-${day}`;
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeForMatch(text: string): string {
  return stripAccents(text).toUpperCase().replace(/\r\n/g, "\n");
}

function hasPattern(text: string, re: RegExp): boolean {
  return re.test(text);
}

function extractOxygenVolume(text: string): number | null {
  const explicit = [
    /\b30\s*VOL\b/,
    /\b20\s*VOL\b/,
    /\b15\s*VOL\b/,
    /\b10\s*VOL\b/,
    /\bVOL\s*30\b/,
    /\bVOL\s*20\b/,
    /\bVOL\s*15\b/,
    /\bVOL\s*10\b/,
  ];
  for (const re of explicit) {
    if (re.test(text)) {
      const m = re.exec(text);
      const n = m?.[0].match(/\d{2}/)?.[0];
      if (n) return Number(n);
    }
  }

  const generic = /\b(\d{1,2})\s*VOL\b/.exec(text);
  if (generic) {
    const vol = Number(generic[1]);
    if (vol >= 5 && vol <= 40) return vol;
  }
  if (/\bVOL\b/.test(text) && /\bSHAT\b/.test(text)) return 20;
  return null;
}

type SignalBucket = "botanicals" | "lightening" | "direct_color" | "oxidation_color" | "keratin";

function detectSignals(normalized: string): { buckets: Set<SignalBucket>; signals: string[] } {
  const buckets = new Set<SignalBucket>();
  const signals: string[] = [];

  const add = (bucket: SignalBucket, signal: string) => {
    buckets.add(bucket);
    signals.push(signal);
  };

  if (
    hasPattern(normalized, /\bMALLO\b/) ||
    hasPattern(normalized, /\bEMOLLIENTE\b/) ||
    hasPattern(normalized, /\bROSSO\b/) ||
    hasPattern(normalized, /\bHENNE\b/) ||
    hasPattern(normalized, /\bLAWSONIA\b/) ||
    hasPattern(normalized, /\bINDIGO\b/) ||
    hasPattern(normalized, /\bCASSIA\b/) ||
    hasPattern(normalized, /\bERBE\b/)
  ) {
    add("botanicals", "botanicals_keyword");
  }

  if (hasPattern(normalized, /\bEMO\b/)) {
    add("botanicals", "emo");
  }

  if (
    hasPattern(normalized, /\bSHAT\b/) ||
    hasPattern(normalized, /\bSHATUSH\b/) ||
    hasPattern(normalized, /\bSCHIARITURA\b/) ||
    hasPattern(normalized, /\bDECOLORAZIONE\b/) ||
    hasPattern(normalized, /\bSANLAI\b/)
  ) {
    add("lightening", "lightening_keyword");
  }

  if (hasPattern(normalized, /\bDIRECT\s*COLOR\b/)) {
    add("direct_color", "direct_color_phrase");
  }

  if (
    hasPattern(normalized, /\bDI\s+[257]\b/) ||
    hasPattern(normalized, /\b[257]\s*\+\s*\d/) ||
    hasPattern(normalized, /\b\d+\s*GR\s+[257]\b/) ||
    hasPattern(normalized, /\b\d+\s*DI\s+[257]\b/)
  ) {
    add("direct_color", "direct_shade_number");
  }

  if (hasPattern(normalized, /\b\d{1,2}\.\d{1,2}\b/)) {
    add("oxidation_color", "oxidation_shade_dot");
  }

  if (
    hasPattern(normalized, /\bKERATIN\b/) ||
    hasPattern(normalized, /\bKERATINA\b/) ||
    hasPattern(normalized, /\bLISCIANTE\b/)
  ) {
    add("keratin", "keratin_keyword");
  }

  const hasOxygen = /\b\d{1,2}\s*VOL\b/.test(normalized) || /\bVOL\b/.test(normalized);
  if (hasOxygen && !buckets.has("botanicals") && buckets.size === 0) {
    signals.push("oxygen_only");
  }

  return { buckets, signals };
}

function pickPrimaryType(buckets: Set<SignalBucket>): ServiceTypeGuess | null {
  if (buckets.size !== 1) return null;
  return [...buckets][0]!;
}

export function classifyBossTechnicalNote(parts: {
  noteTecnicheBase: string;
  consigli: string;
  noteTecnicheAvanzate: string;
}): ClassificationResult {
  const combinedText = combineBossTechnicalNoteText(parts);
  const normalized = normalizeForMatch(combinedText);
  const warnings: string[] = [];
  const oxygenVolume = extractOxygenVolume(normalized);
  const hasOxygen = oxygenVolume !== null || /\bVOL\b/.test(normalized);

  if (!combinedText.trim()) {
    return {
      serviceType: "legacy_note",
      confidence: "low",
      warnings: ["no_notes"],
      oxygenVolume: null,
      signals: [],
      combinedText,
      originalParts: parts,
    };
  }

  const { buckets, signals } = detectSignals(normalized);

  if (buckets.size === 0) {
    if (hasOxygen) warnings.push("oxygen_only");
    return {
      serviceType: "legacy_note",
      confidence: "low",
      warnings,
      oxygenVolume,
      signals,
      combinedText,
      originalParts: parts,
    };
  }

  const hasBotanicals = buckets.has("botanicals");
  const nonBotanical = [...buckets].filter((b) => b !== "botanicals");

  if (buckets.size > 1) {
    if (hasBotanicals && hasOxygen && nonBotanical.length === 0) {
      warnings.push("mixed_botanicals_oxygen");
      return {
        serviceType: "botanicals",
        confidence: "medium",
        warnings,
        oxygenVolume,
        signals,
        combinedText,
        originalParts: parts,
      };
    }

    warnings.push("ambiguous_formula");
    if (hasBotanicals && hasOxygen) warnings.push("mixed_botanicals_oxygen");
    return {
      serviceType: "mixed_legacy",
      confidence: "low",
      warnings,
      oxygenVolume,
      signals,
      combinedText,
      originalParts: parts,
    };
  }

  const single = pickPrimaryType(buckets)!;
  if (hasBotanicals && hasOxygen) {
    warnings.push("mixed_botanicals_oxygen");
  }

  const strong =
    (single === "lightening" && /\b(SHAT|SHATUSH|SANLAI|DECOLORAZIONE)\b/.test(normalized)) ||
    (single === "keratin" && /\b(KERATIN|KERATINA)\b/.test(normalized)) ||
    (single === "botanicals" && /\b(HENNE|MALLO|LAWSONIA)\b/.test(normalized)) ||
    (single === "direct_color" && /\bDIRECT\s*COLOR\b/.test(normalized));

  const weakOxidation =
    single === "oxidation_color" &&
    !/\b(SHAT|HENNE|MALLO|KERATIN|DIRECT)\b/.test(normalized) &&
    /\b\d{1,2}\.\d{1,2}\b/.test(normalized);

  let confidence: Confidence = "medium";
  if (strong) confidence = "high";
  else if (weakOxidation || warnings.includes("mixed_botanicals_oxygen")) confidence = "medium";
  else if (single === "direct_color") confidence = "medium";

  if (
    single === "oxidation_color" &&
    buckets.has("oxidation_color") &&
    /\bDI\s+[257]\b/.test(normalized)
  ) {
    warnings.push("ambiguous_formula");
    confidence = "low";
  }

  return {
    serviceType: single,
    confidence,
    warnings,
    oxygenVolume,
    signals,
    combinedText,
    originalParts: parts,
  };
}

export function previewOriginalText(text: string, maxLen = 240): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

export function escapeCsvField(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
