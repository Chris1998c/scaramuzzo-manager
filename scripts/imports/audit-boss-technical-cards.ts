/**
 * Dry-run audit: export Boss schede tecniche → classificazione + match clienti (no DB write).
 * Usage: npm run audit:boss-technical-cards
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  findColumnIndex,
  getField,
  normalizeEmail,
  normalizeNominativo,
  normalizePhone,
  parseCsvSemicolon,
} from "./bossCustomersCsvParse.ts";
import {
  type ClassificationResult,
  type Confidence,
  type ServiceTypeGuess,
  classifyBossTechnicalNote,
  combineBossTechnicalNoteText,
  escapeCsvField,
  previewOriginalText,
  resolveBossTechnicalCardsColumns,
} from "./bossTechnicalCardsClassify.ts";

const REPO_ROOT = process.cwd();
const INPUT_DIR = join(REPO_ROOT, "data/imports/boss-technical-cards");
const CSV_PATH = join(INPUT_DIR, "T1591_N1_elenco_clienti.csv");
const REPORT_PATH = join(INPUT_DIR, "technical-cards-audit-report.json");
const PREVIEW_PATH = join(INPUT_DIR, "technical-cards-preview.csv");

const PAGE_SIZE = 1000;

type CustomerIndex = {
  byPhone: Map<string, string[]>;
  byEmail: Map<string, string[]>;
  byNominativo: Map<string, string[]>;
  total: number;
};

type PreviewRow = {
  nominativo_raw: string;
  date_raw: string;
  matched_customer_id: string;
  service_type_guess: ServiceTypeGuess;
  confidence: Confidence;
  warnings: string;
  original_text_preview: string;
};

function loadEnvLocal(): void {
  const envPath = join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    console.error("Variabile mancante: NEXT_PUBLIC_SUPABASE_URL (in .env.local)");
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error("Variabile mancante: SUPABASE_SERVICE_ROLE_KEY (in .env.local)");
    process.exit(1);
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function addIndex(map: Map<string, string[]>, key: string, id: string): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.includes(id)) list.push(id);
  map.set(key, list);
}

function customerNominativoKey(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.trim().replace(/\s+/g, " ").toUpperCase();
}

function phoneKeys(raw: string): string[] {
  const keys = new Set<string>();
  const trimmed = raw.trim();
  if (trimmed) keys.add(trimmed);
  const norm = normalizePhone(trimmed);
  if (norm) keys.add(norm);
  return [...keys];
}

async function loadCustomerIndex(): Promise<CustomerIndex | null> {
  if (!existsSync(join(REPO_ROOT, ".env.local"))) {
    console.warn("⚠ .env.local assente: skip match public.customers");
    return null;
  }

  loadEnvLocal();
  const supabase = createSupabaseAdmin();
  const byPhone = new Map<string, string[]>();
  const byEmail = new Map<string, string[]>();
  const byNominativo = new Map<string, string[]>();
  let offset = 0;
  let total = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Lettura customers: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      total++;
      const id = String(row.id);
      for (const k of phoneKeys(String(row.phone ?? ""))) addIndex(byPhone, k, id);
      const email = normalizeEmail(String(row.email ?? ""));
      if (email) addIndex(byEmail, email, id);
      const key = customerNominativoKey(
        String(row.last_name ?? ""),
        String(row.first_name ?? ""),
      );
      if (key) addIndex(byNominativo, key, id);
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { byPhone, byEmail, byNominativo, total };
}

function matchCustomer(
  index: CustomerIndex | null,
  row: string[],
  cols: ReturnType<typeof resolveBossTechnicalCardsColumns>,
): { id: string | null; method: string | null; ambiguous: boolean } {
  if (!index) return { id: null, method: null, ambiguous: false };

  const candidates = new Set<string>();
  let method: string | null = null;

  const phones = [
    getField(row, cols.telefono),
    getField(row, cols.cellulare),
    getField(row, cols.altroTelefono),
  ];

  for (const raw of phones) {
    for (const key of phoneKeys(raw)) {
      const ids = index.byPhone.get(key);
      if (!ids?.length) continue;
      for (const id of ids) candidates.add(id);
      if (!method) method = "phone";
    }
  }

  const emails = [getField(row, cols.email), getField(row, cols.altraEmail)];
  for (const raw of emails) {
    const key = normalizeEmail(raw);
    if (!key) continue;
    const ids = index.byEmail.get(key);
    if (!ids?.length) continue;
    for (const id of ids) candidates.add(id);
    if (!method) method = "email";
  }

  const { key: nominativoKey } = normalizeNominativo(getField(row, cols.nominativo));
  if (nominativoKey) {
    const ids = index.byNominativo.get(nominativoKey);
    if (ids?.length) {
      for (const id of ids) candidates.add(id);
      if (!method) method = "nominativo";
    }
  }

  if (candidates.size === 0) return { id: null, method: null, ambiguous: false };
  if (candidates.size > 1) {
    return { id: [...candidates][0]!, method, ambiguous: true };
  }
  return { id: [...candidates][0]!, method, ambiguous: false };
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function isClassifiable(result: ClassificationResult): boolean {
  return (
    result.serviceType !== "legacy_note" &&
    result.serviceType !== "mixed_legacy" &&
    result.confidence !== "low"
  );
}

function isAmbiguousOrMixed(result: ClassificationResult): boolean {
  return (
    result.serviceType === "mixed_legacy" ||
    result.confidence === "low" ||
    result.warnings.includes("ambiguous_formula")
  );
}

async function runBossTechnicalCardsAudit(): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(CSV_PATH, "utf8");
  } catch {
    console.error(`File non trovato: ${CSV_PATH}`);
    console.error(
      "Copia l'export Boss in data/imports/boss-technical-cards/T1591_N1_elenco_clienti.csv",
    );
    process.exit(1);
  }

  const parsed = parseCsvSemicolon(raw.replace(/^\uFEFF/, ""));
  if (parsed.length === 0) {
    console.error("CSV vuoto.");
    process.exit(1);
  }

  const headers = parsed[0];
  const dataRows = parsed.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const cols = resolveBossTechnicalCardsColumns(headers);

  const customerIndex = await loadCustomerIndex();

  let withBase = 0;
  let withConsigli = 0;
  let withAdvanced = 0;
  let withAnyNote = 0;
  let classifiable = 0;
  let ambiguousMixed = 0;
  let matchedCustomers = 0;
  let unmatchedCustomers = 0;

  const serviceTypeDist: Record<string, number> = {};
  const confidenceDist: Record<string, number> = {};
  const warningsDist: Record<string, number> = {};
  const matchMethodDist: Record<string, number> = {};

  const previewRows: PreviewRow[] = [];
  const samplesByType: Record<string, Array<Record<string, unknown>>> = {};

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const parts = {
      noteTecnicheBase: getField(row, cols.noteTecnicheBase),
      consigli: getField(row, cols.consigli),
      noteTecnicheAvanzate: getField(row, cols.noteTecnicheAvanzate),
    };

    if (parts.noteTecnicheBase) withBase++;
    if (parts.consigli) withConsigli++;
    if (parts.noteTecnicheAvanzate) withAdvanced++;

    const hasNotes =
      parts.noteTecnicheBase !== "" ||
      parts.consigli !== "" ||
      parts.noteTecnicheAvanzate !== "";
    if (!hasNotes) continue;

    withAnyNote++;

    const dateRaw = getField(row, cols.data);
    const nominativoRaw = getField(row, cols.nominativo);
    const classification = classifyBossTechnicalNote(parts);
    const warnings = [...classification.warnings];

    if (!dateRaw.trim()) warnings.push("no_date");

    const match = matchCustomer(customerIndex, row, cols);
    if (customerIndex) {
      if (match.id) {
        matchedCustomers++;
        if (match.method) increment(matchMethodDist, match.method);
      } else {
        unmatchedCustomers++;
        warnings.push("unmatched_customer");
      }
      if (match.ambiguous) warnings.push("ambiguous_customer_match");
    }

    increment(serviceTypeDist, classification.serviceType);
    increment(confidenceDist, classification.confidence);
    for (const w of warnings) increment(warningsDist, w);

    if (isClassifiable(classification)) classifiable++;
    if (isAmbiguousOrMixed(classification)) ambiguousMixed++;

    previewRows.push({
      nominativo_raw: nominativoRaw,
      date_raw: dateRaw,
      matched_customer_id: match.id ?? "",
      service_type_guess: classification.serviceType,
      confidence: classification.confidence,
      warnings: warnings.join("|"),
      original_text_preview: previewOriginalText(combineBossTechnicalNoteText(parts)),
    });

    if (!samplesByType[classification.serviceType]) samplesByType[classification.serviceType] = [];
    if (samplesByType[classification.serviceType]!.length < 3) {
      samplesByType[classification.serviceType]!.push({
        row: i + 2,
        nominativo: nominativoRaw.slice(0, 40),
        confidence: classification.confidence,
        warnings,
        oxygenVolume: classification.oxygenVolume,
        preview: previewOriginalText(classification.combinedText, 120),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile: "data/imports/boss-technical-cards/T1591_N1_elenco_clienti.csv",
    dryRun: true,
    wroteCustomerServiceCards: false,
    columns: {
      detected: headers,
      indices: cols,
      nominativoViaBossCustomersParser: findColumnIndex(headers, "nominativo"),
    },
    totals: {
      csvRowsIncludingHeader: parsed.length,
      dataRows: dataRows.length,
      withNoteTecnicheBase: withBase,
      withConsigli: withConsigli,
      withNoteTecnicheAvanzate: withAdvanced,
      withAnyTechnicalNote: withAnyNote,
      classifiableByServiceType: classifiable,
      ambiguousOrMixed: ambiguousMixed,
      previewRows: previewRows.length,
    },
    customerMatch: customerIndex
      ? {
          customersInDb: customerIndex.total,
          matchedRows: matchedCustomers,
          unmatchedRows: unmatchedCustomers,
          matchRateAmongNotes:
            withAnyNote > 0
              ? Number((matchedCustomers / withAnyNote).toFixed(4))
              : 0,
          methods: matchMethodDist,
        }
      : {
          skipped: true,
          reason: "missing .env.local or Supabase credentials",
        },
    classification: {
      serviceTypeDistribution: serviceTypeDist,
      confidenceDistribution: confidenceDist,
      warningsDistribution: warningsDist,
      mappingNotes: {
        sanlai: "classificato come lightening (nessun service_type sanlai in app)",
        dbServiceTypes:
          "import futuro: oxidation_color, gloss, lightening, keratin, botanicals (UI); legacy_note/mixed_legacy solo audit",
        oxygenVolume:
          "estratto in classificazione ma non persistito finché non si implementa import",
      },
    },
    samplesByType,
  };

  mkdirSync(INPUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const previewHeader = [
    "nominativo_raw",
    "date_raw",
    "matched_customer_id",
    "service_type_guess",
    "confidence",
    "warnings",
    "original_text_preview",
  ];
  const previewLines = [
    previewHeader.join(";"),
    ...previewRows.map((r) =>
      [
        r.nominativo_raw,
        r.date_raw,
        r.matched_customer_id,
        r.service_type_guess,
        r.confidence,
        r.warnings,
        r.original_text_preview,
      ]
        .map(escapeCsvField)
        .join(";"),
    ),
  ];
  writeFileSync(PREVIEW_PATH, `${previewLines.join("\n")}\n`, "utf8");

  console.log("=== Audit schede tecniche Boss (DRY-RUN) ===\n");
  console.log(`Righe dati CSV: ${report.totals.dataRows}`);
  console.log(`Con note tecniche (qualsiasi campo): ${withAnyNote}`);
  console.log(`  NoteTecnicheBase: ${withBase}`);
  console.log(`  Consigli: ${withConsigli}`);
  console.log(`  NoteTecnicheAvanzate: ${withAdvanced}`);
  console.log(`Classificabili (tipo chiaro, confidence non low): ${classifiable}`);
  console.log(`Ambigue / mixed / low: ${ambiguousMixed}`);

  if (customerIndex) {
    console.log(
      `\nMatch clienti DB (${customerIndex.total} in anagrafica): ${matchedCustomers} ok, ${unmatchedCustomers} unmatched`,
    );
    console.log(`  Metodi: ${JSON.stringify(matchMethodDist)}`);
  } else {
    console.log("\nMatch clienti: saltato (manca .env.local)");
  }

  console.log("\nDistribuzione service_type:");
  for (const [k, v] of Object.entries(serviceTypeDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  console.log("\nConfidence:");
  for (const [k, v] of Object.entries(confidenceDist).sort()) {
    console.log(`  ${k}: ${v}`);
  }

  console.log(`\nReport JSON: ${REPORT_PATH}`);
  console.log(`Preview CSV: ${PREVIEW_PATH} (${previewRows.length} righe)`);
}

runBossTechnicalCardsAudit().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
