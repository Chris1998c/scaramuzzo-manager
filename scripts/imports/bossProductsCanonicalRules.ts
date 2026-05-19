/**
 * Regole canoniche locali per classificazione prodotti Boss (working copy).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type CanonicalStrategy = "merge_generic" | "keep_brand_specific" | "keep_exact";

export type CanonicalRule = {
  id: string;
  match: string[];
  canonical_name: string;
  usage_type: string;
  product_category: string;
  canonical_strategy: CanonicalStrategy;
  /** Se true, tutte le stringhe match devono essere presenti (AND). Default: OR. */
  match_all?: boolean;
};

export type CanonicalRulesFile = {
  version: number;
  description?: string;
  rules: CanonicalRule[];
};

export const DEFAULT_CANONICAL_RULES_PATH = join(
  process.cwd(),
  "data/imports/products-boss/product-canonical-rules.json",
);

export function loadCanonicalRules(
  path: string = DEFAULT_CANONICAL_RULES_PATH,
): CanonicalRulesFile | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as CanonicalRulesFile;
  if (!parsed.rules?.length) return null;
  return parsed;
}

function ruleMatches(nameNormalized: string, rule: CanonicalRule): boolean {
  const hay = nameNormalized.toLowerCase();
  const needles = rule.match.map((m) => m.toLowerCase().trim()).filter(Boolean);
  if (needles.length === 0) return false;
  if (rule.match_all) {
    return needles.every((n) => hay.includes(n));
  }
  return needles.some((n) => hay.includes(n));
}

export type CanonicalApplication = {
  ruleId: string;
  canonicalName: string;
  usageType: string;
  productCategory: string;
  canonicalStrategy: CanonicalStrategy;
};

export function applyCanonicalRule(
  nameNormalized: string,
  rules: CanonicalRule[],
): CanonicalApplication | null {
  for (const rule of rules) {
    if (ruleMatches(nameNormalized, rule)) {
      return {
        ruleId: rule.id,
        canonicalName: rule.canonical_name,
        usageType: rule.usage_type,
        productCategory: rule.product_category,
        canonicalStrategy: rule.canonical_strategy,
      };
    }
  }
  return null;
}

export type ClassifiedWithCanonical<T> = T & {
  canonical_name: string | null;
  canonical_strategy: CanonicalStrategy | null;
  canonical_rule_id: string | null;
  product_category_after: string;
  usage_type_after: string;
};

export function enrichWithCanonicalRules<T extends {
  name_normalized: string;
  candidate_name: string;
  product_category: string;
  usage_type: string;
  is_noise: boolean;
}>(
  rows: T[],
  rulesFile: CanonicalRulesFile,
): ClassifiedWithCanonical<T>[] {
  return rows.map((row) => {
    const base = {
      ...row,
      canonical_name: null as string | null,
      canonical_strategy: null as CanonicalStrategy | null,
      canonical_rule_id: null as string | null,
      product_category_after: row.product_category,
      usage_type_after: row.usage_type,
    };

    if (row.is_noise || row.product_category !== "unknown") {
      return base;
    }

    const applied = applyCanonicalRule(row.name_normalized, rulesFile.rules);
    if (!applied) return base;

    return {
      ...base,
      canonical_name: applied.canonicalName,
      canonical_strategy: applied.canonicalStrategy,
      canonical_rule_id: applied.ruleId,
      product_category_after: applied.productCategory,
      usage_type_after:
        row.usage_type === "unknown" ? applied.usageType : row.usage_type,
    };
  });
}
