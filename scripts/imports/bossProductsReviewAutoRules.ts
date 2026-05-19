/**
 * Regole conservative auto-review per products-review-priority → final.
 */

import type { ReviewCsvRow } from "./bossProductsReviewCsv.ts";

export type AutoReviewResult = {
  suggested_action: string;
  manual_category: string;
  manual_usage_type: string;
  notes: string;
  ruleId: string;
};

function haystack(row: ReviewCsvRow): string {
  return `${row.candidate_name} ${row.name_normalized} ${row.categories}`.toLowerCase();
}

function matchAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(p));
}

export function usageFromCategories(row: ReviewCsvRow, fallback: string): string {
  const cat = (row.categories ?? "").toLowerCase();
  if (cat.includes("uso interno") && cat.includes("rivendita")) return "dual_use";
  if (cat.includes("rivendita") || cat.includes("store")) return "retail";
  if (cat.includes("uso salone")) return "salon_use";
  if (cat.includes("uso interno")) return "internal_use";
  return fallback;
}

function keepExact(
  row: ReviewCsvRow,
  category: string,
  usage: string,
  ruleId: string,
  notes: string,
): AutoReviewResult {
  return {
    suggested_action: "keep_exact",
    manual_category: category,
    manual_usage_type: usageFromCategories(row, usage),
    notes,
    ruleId,
  };
}

function importRow(
  row: ReviewCsvRow,
  category: string,
  usage: string,
  ruleId: string,
  notes: string,
): AutoReviewResult {
  return {
    suggested_action: "import",
    manual_category: category,
    manual_usage_type: usageFromCategories(row, usage),
    notes,
    ruleId,
  };
}

function excludeRow(ruleId: string, notes: string): AutoReviewResult {
  return {
    suggested_action: "exclude",
    manual_category: "accessori",
    manual_usage_type: "retail",
    notes,
    ruleId,
  };
}

/** Applica regole in ordine di priorità (prima match vince). */
export function applyAutoReviewRules(row: ReviewCsvRow): AutoReviewResult | null {
  if (row.is_noise === "true") return null;

  const text = haystack(row);

  if (
    matchAny(text, [
      "fiori",
      "gadget natalizio",
      "christmas",
      "wall decor",
      "appendini cuore",
      "cofanetto regalo",
      "the market",
      "piatto fondo",
      "piatto frutta",
      "piatto piano",
      "tovaglietta nataliz",
      "decor",
    ])
  ) {
    return excludeRow("exclude_decorative", "Decorativo / stagionale — escludere");
  }

  if (
    matchAny(text, [
      "henne",
      "henné",
      "mallo",
      "emolliente scaramuzzo",
      "miscele erbe",
      "erbe riflessanti",
      "lawsonia",
      "indigo",
      "cassia",
    ])
  ) {
    return keepExact(row, "erbe", "salon_use", "keep_exact_erbe", "Linea erbe / henné");
  }

  if (
    matchAny(text, [
      "oxidant",
      "ossigeno",
      "ossigeni",
      "peroxide",
      "perossido",
      "oss 1",
      "oss 2",
      "oss 3",
      "oss 4",
      "oss 5",
      "oss 6",
      "oss 7",
      "oss 8",
      "oss 9",
      "oss 10",
      "oss 20",
      "oss 30",
      "oss 40",
      " vol ",
      "vol ",
    ]) &&
    (matchAny(text, ["oxidant", "ossigeno", "oss ", "peroxide", "milk", "vol"]) ||
      /\b\d+[,.]?\d*\s*vol\b/.test(text))
  ) {
    return keepExact(row, "ossigeni", "salon_use", "keep_exact_ossigeni", "Ossigeno / attivatore");
  }

  if (
    matchAny(text, [
      "luxury hair color",
      "j color",
      "joc color",
      "odm",
      "oil demi",
      "colorante",
      "direct color",
      "nutris color",
      "scaramuzzo hnb",
      "crema color",
      "tinta",
      "color ",
      "colore ",
      "permanente",
    ]) &&
    !matchAny(text, ["poncio colorati", "mattoncino"])
  ) {
    const cat = matchAny(text, ["gloss", "tonalizzante", "toner", "pearl"])
      ? "gloss_tonalizzanti"
      : "colori";
    return keepExact(row, cat, "salon_use", "keep_exact_colori", "Linea colore");
  }

  if (matchAny(text, ["gloss", "tonalizzante", "toner", "pearl gloss"])) {
    return keepExact(row, "gloss_tonalizzanti", "salon_use", "keep_exact_gloss", "Tonalizzante / gloss");
  }

  if (matchAny(text, ["decolorante", "deco ", "bleach", "lightener", "schiarente", "polvere decolor"])) {
    return keepExact(row, "decolorazione", "salon_use", "keep_exact_decolorazione", "Decolorazione");
  }

  if (matchAny(text, ["shampoo", "bagnoschiuma", "docciaschiuma"])) {
    return keepExact(row, "lavaggio", "dual_use", "keep_exact_lavaggio", "Shampoo / lavaggio");
  }

  if (matchAny(text, ["maschera", " mask"]) && !matchAny(text, ["mascara"])) {
    return keepExact(row, "conditioner_maschere", "dual_use", "keep_exact_maschera", "Maschera");
  }

  if (matchAny(text, ["conditioner", "condizionante", "balsamo"])) {
    return keepExact(row, "conditioner_maschere", "dual_use", "keep_exact_conditioner", "Conditioner");
  }

  if (
    matchAny(text, [
      "keratina",
      "keratin",
      "molecular",
      "molecolar",
      "quicktreat",
      "firming treatment",
      "trattamento",
      "treatment",
      "trattamenti",
      "ricostru",
      "ristruttur",
      "filler",
      "botox",
      "bond",
      "repair",
      "siero",
      "serum",
      "ampoll",
      "lozione",
      "lotion",
    ])
  ) {
    return keepExact(row, "trattamenti", "salon_use", "keep_exact_trattamenti", "Trattamento");
  }

  if (
    matchAny(text, [
      "lacca",
      "mousse",
      "styling",
      "gel ",
      "gel scrub",
      "cera",
      "wax",
      "pasta modell",
      "spray",
      "fissatore",
      "lacc",
    ]) &&
    !matchAny(text, ["olio solare", "abbronzante corpo"])
  ) {
    return keepExact(row, "styling", "dual_use", "keep_exact_styling", "Styling");
  }

  if (
    matchAny(text, [
      "olio solare",
      "abbronzante",
      "scrub",
      "crema corpo",
      "crema mani",
      "olio idratante",
      "corpo-viso",
      "solare",
      "doposole",
    ])
  ) {
    return keepExact(row, "cosmetica", "retail", "keep_exact_cosmetica", "Cosmetica corpo / solare");
  }

  if (
    matchAny(text, [
      "buste spazzatura",
      "cotone",
      "salviette",
      "cuffie tnt",
      "cuffiet",
      "fasce tnt",
      "guanti",
      "stagnola",
      "bicchier",
      "mantella",
      "carta collo",
      "telo ",
      "spazzatura",
    ])
  ) {
    const usage = matchAny(text, ["guanti", "stagnola", "buste spazzatura", "cotone"])
      ? "internal_use"
      : "salon_use";
    return importRow(row, "consumabili", usage, "import_consumabili", "Consumabile salone");
  }

  if (
    matchAny(text, [
      "pennell",
      "pennello",
      "ciotola",
      "lama",
      "sgorbia",
      "aghi",
      "pettine",
      "spazzola",
      "forbic",
      "tagliacapelli",
      "phon",
      "piastra",
    ])
  ) {
    return importRow(row, "attrezzatura", "salon_use", "import_attrezzatura", "Attrezzatura salone");
  }

  if (matchAny(text, ["profumo", "eau de parfum", "fragranza"])) {
    return keepExact(row, "profumi", "retail", "keep_exact_profumi", "Profumo");
  }

  if (matchAny(text, ["candeggina", "alcool", "disinfettante", "detergente", "solvente", "igienizz"])) {
    return importRow(row, "pulizia", "salon_use", "import_pulizia", "Pulizia / igienizzazione");
  }

  if (matchAny(text, ["24 kerats", "24kerats", "barex", "aeto", "joc ", "joc cure"])) {
    return keepExact(row, "trattamenti", "dual_use", "keep_exact_brand_line", "Linea brand");
  }

  if (matchAny(text, ["collant", "occhiali", "pantaloni", "borsa", "poncio", "scatola", "pochette", "sacchetto"])) {
    return importRow(
      row,
      "accessori",
      "retail",
      "import_accessori_retail",
      "Accessori / retail — verificare se ancora venduto",
    );
  }

  if (matchAny(text, ["foulard"]) && matchAny(text, ["logo"])) {
    return importRow(row, "accessori", "retail", "import_merchandising", "Merchandising / logo");
  }

  if (matchAny(text, ["gadget"]) && !matchAny(text, ["olio super abbronzante"])) {
    return importRow(row, "accessori", "retail", "import_gadget", "Gadget — verificare retail");
  }

  return null;
}
