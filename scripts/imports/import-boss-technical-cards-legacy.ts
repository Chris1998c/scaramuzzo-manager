/**
 * Import Boss schede tecniche → customer_service_cards come storico legacy (solo legacy_note).
 *
 * Usage:
 *   npm run import:boss-technical-cards:legacy -- --dry-run
 *   npm run import:boss-technical-cards:legacy -- --dry-run --limit 20
 *   npm run import:boss-technical-cards:legacy -- --commit --limit 100
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getField, parseCsvSemicolon } from "./bossCustomersCsvParse.ts";
import {
  bossTechnicalNoteOriginalText,
  classifyBossTechnicalNote,
  parseBossLegacyDate,
  resolveBossTechnicalCardsColumns,
  type Confidence,
  type ServiceTypeGuess,
} from "./bossTechnicalCardsClassify.ts";
import { loadCustomerIndex, matchCustomerFromBossRow } from "./bossTechnicalCardsMatch.ts";

const REPO_ROOT = process.cwd();
const CSV_PATH = join(
  REPO_ROOT,
  "data/imports/boss-technical-cards/T1591_N1_elenco_clienti.csv",
);

const IMPORT_VERSION = 1;
const SERVICE_TYPE = "legacy_note";
const PAGE_SIZE = 1000;

const FALLBACK_SERVICE_CARD_COLUMNS = [
  "id",
  "customer_id",
  "service_type",
  "data",
  "salon_id",
  "staff_id",
  "appointment_id",
  "created_at",
] as const;

export type BossLegacyCardData = {
  source: "boss";
  original_text: string;
  legacy_guess: ServiceTypeGuess;
  confidence: Confidence;
  legacy_date: string | null;
  legacy_tipo_nota: string | null;
  warnings: string[];
  import_version: number;
};

type LegacyInsertRow = {
  customer_id: string;
  service_type: typeof SERVICE_TYPE;
  data: BossLegacyCardData;
  sourceRowNumber: number;
  nominativoRaw: string;
};

type ProcessOutcome =
  | "would_insert"
  | "inserted"
  | "skipped_unmatched"
  | "skipped_ambiguous_match"
  | "skipped_no_notes"
  | "skipped_duplicate"
  | "error";

type SampleRow = {
  sourceRow: number;
  customerId: string;
  nominativo: string;
  outcome: ProcessOutcome;
  detail?: string;
  payload?: BossLegacyCardData;
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

function createSupabaseAdmin(): SupabaseClient {
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

function parseArgs(argv: string[]): { dryRun: boolean; limit: number | null } {
  const commit = argv.includes("--commit");
  const dryRun = argv.includes("--dry-run") || !commit;

  let limit: number | null = null;
  const idx = argv.indexOf("--limit");
  if (idx >= 0 && argv[idx + 1]) {
    const n = Number(argv[idx + 1]);
    if (!Number.isFinite(n) || n < 1) {
      console.error("--limit richiede un intero positivo");
      process.exit(1);
    }
    limit = Math.floor(n);
  }

  return { dryRun, limit };
}

function dedupeKey(customerId: string, originalText: string, legacyDate: string | null): string {
  const text = originalText.replace(/\r\n/g, "\n").trim();
  const date = legacyDate ?? "";
  return `${customerId}|${date}|${text}`;
}

async function probeServiceCardsSchema(supabase: SupabaseClient): Promise<{
  columns: string[];
  serviceTypeCheckNote: string;
}> {
  const { data, error } = await supabase.from("customer_service_cards").select("*").limit(1);

  if (error) {
    return {
      columns: [...FALLBACK_SERVICE_CARD_COLUMNS],
      serviceTypeCheckNote: `probe fallito (${error.message}); vedi migration 20260315212845`,
    };
  }

  const sample = data?.[0];
  const columns =
    sample && typeof sample === "object"
      ? Object.keys(sample).sort()
      : [...FALLBACK_SERVICE_CARD_COLUMNS];

  return {
    columns,
    serviceTypeCheckNote:
      "migration locale: oxidation|direct|botanicals|gloss|lightening|keratin|treatment — " +
      "legacy_note richiede estensione CHECK su DB remoto prima di --commit",
  };
}

async function loadExistingBossLegacyDedupKeys(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const keys = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("customer_service_cards")
      .select("customer_id, service_type, data")
      .eq("service_type", SERVICE_TYPE)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Lettura legacy cards: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      const payload = row.data as Record<string, unknown> | null;
      if (!payload || payload.source !== "boss") continue;
      const original = String(payload.original_text ?? "").replace(/\r\n/g, "\n").trim();
      const legacyDate =
        payload.legacy_date != null && String(payload.legacy_date).trim() !== ""
          ? String(payload.legacy_date)
          : null;
      keys.add(dedupeKey(String(row.customer_id), original, legacyDate));
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return keys;
}

function buildLegacyPayload(
  parts: {
    noteTecnicheBase: string;
    consigli: string;
    noteTecnicheAvanzate: string;
  },
  dateRaw: string,
  tipoNotaRaw: string,
): BossLegacyCardData {
  const classification = classifyBossTechnicalNote(parts);
  const warnings = [...classification.warnings];
  const legacyDate = parseBossLegacyDate(dateRaw);
  if (!legacyDate && dateRaw.trim()) warnings.push("unparsed_legacy_date");

  return {
    source: "boss",
    original_text: bossTechnicalNoteOriginalText(parts),
    legacy_guess: classification.serviceType,
    confidence: classification.confidence,
    legacy_date: legacyDate,
    legacy_tipo_nota: tipoNotaRaw.trim() || null,
    warnings,
    import_version: IMPORT_VERSION,
  };
}

function maskNominativo(raw: string): string {
  const t = raw.trim();
  if (t.length <= 4) return `${t.slice(0, 1)}***`;
  return `${t.slice(0, 4)}***`;
}

async function insertLegacyCard(
  supabase: SupabaseClient,
  row: LegacyInsertRow,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("customer_service_cards")
    .insert({
      customer_id: row.customer_id,
      service_type: row.service_type,
      data: row.data,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  const id = data?.id != null ? String(data.id) : "";
  if (!id) return { ok: false, error: "Insert senza id restituito" };
  return { ok: true, id };
}

async function runImportBossTechnicalCardsLegacy(): Promise<void> {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  if (!existsSync(join(REPO_ROOT, ".env.local"))) {
    console.error("Richiesto .env.local con credenziali Supabase.");
    process.exit(1);
  }

  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  let rawCsv: string;
  try {
    rawCsv = readFileSync(CSV_PATH, "utf8");
  } catch {
    console.error(`File non trovato: ${CSV_PATH}`);
    process.exit(1);
  }

  const parsed = parseCsvSemicolon(rawCsv.replace(/^\uFEFF/, ""));
  const headers = parsed[0] ?? [];
  const dataRows = parsed.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const cols = resolveBossTechnicalCardsColumns(headers);

  console.log("=== Import Boss schede tecniche → legacy_note ===\n");
  console.log(`Modalità: ${dryRun ? "DRY-RUN (nessuna scrittura)" : "COMMIT"}`);
  if (limit !== null) console.log(`Limit inserimenti: ${limit}`);

  const schemaProbe = await probeServiceCardsSchema(supabase);
  console.log("\n--- Schema public.customer_service_cards (probe) ---");
  console.log(`Colonne: ${schemaProbe.columns.join(", ")}`);
  console.log(`Nota service_type: ${schemaProbe.serviceTypeCheckNote}`);

  const [customerIndex, existingDedupKeys] = await Promise.all([
    loadCustomerIndex(supabase),
    loadExistingBossLegacyDedupKeys(supabase),
  ]);

  const summary = {
    rowsRead: dataRows.length,
    rowsWithNotes: 0,
    matchedCustomers: 0,
    unmatchedCustomers: 0,
    skippedAmbiguousMatch: 0,
    skippedDuplicate: 0,
    skippedNoNotes: 0,
    wouldInsert: 0,
    inserted: 0,
    errors: 0,
  };

  const ambiguousSamples: SampleRow[] = [];
  const maxAmbiguousSamples = 10;

  const candidates: LegacyInsertRow[] = [];
  const seenBatchKeys = new Set<string>();
  const duplicateSamples: SampleRow[] = [];
  const maxDuplicateSamples = 3;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const parts = {
      noteTecnicheBase: getField(row, cols.noteTecnicheBase),
      consigli: getField(row, cols.consigli),
      noteTecnicheAvanzate: getField(row, cols.noteTecnicheAvanzate),
    };

    const hasNotes =
      parts.noteTecnicheBase !== "" ||
      parts.consigli !== "" ||
      parts.noteTecnicheAvanzate !== "";
    if (!hasNotes) {
      summary.skippedNoNotes++;
      continue;
    }

    summary.rowsWithNotes++;

    const match = matchCustomerFromBossRow(customerIndex, row, cols);
    const nominativoRaw = getField(row, cols.nominativo);
    const sourceRowNumber = i + 2;

    if (!match.id) {
      summary.unmatchedCustomers++;
      continue;
    }

    if (match.ambiguous) {
      summary.skippedAmbiguousMatch++;
      if (ambiguousSamples.length < maxAmbiguousSamples) {
        ambiguousSamples.push({
          sourceRow: sourceRowNumber,
          customerId: match.id,
          nominativo: maskNominativo(nominativoRaw),
          outcome: "skipped_ambiguous_match",
          detail: `match method: ${match.method ?? "unknown"}`,
        });
      }
      continue;
    }

    summary.matchedCustomers++;

    const data = buildLegacyPayload(
      parts,
      getField(row, cols.data),
      getField(row, cols.tipoNota),
    );

    const key = dedupeKey(match.id, data.original_text, data.legacy_date);
    if (existingDedupKeys.has(key) || seenBatchKeys.has(key)) {
      summary.skippedDuplicate++;
      if (duplicateSamples.length < maxDuplicateSamples) {
        duplicateSamples.push({
          sourceRow: sourceRowNumber,
          customerId: match.id,
          nominativo: maskNominativo(nominativoRaw),
          outcome: "skipped_duplicate",
        });
      }
      continue;
    }

    seenBatchKeys.add(key);

    candidates.push({
      customer_id: match.id,
      service_type: SERVICE_TYPE,
      data,
      sourceRowNumber,
      nominativoRaw,
    });
  }

  const toProcess =
    limit !== null ? candidates.slice(0, limit) : candidates;

  const insertSamples: SampleRow[] = [];
  const maxInsertSamples = 12;

  for (const candidate of toProcess) {
    if (dryRun) {
      summary.wouldInsert++;
      if (insertSamples.length < maxInsertSamples) {
        insertSamples.push({
          sourceRow: candidate.sourceRowNumber,
          customerId: candidate.customer_id,
          nominativo: maskNominativo(candidate.nominativoRaw),
          outcome: "would_insert",
          payload: candidate.data,
        });
      }
      continue;
    }

    const result = await insertLegacyCard(supabase, candidate);
    if (result.ok) {
      summary.inserted++;
      existingDedupKeys.add(
        dedupeKey(
          candidate.customer_id,
          candidate.data.original_text,
          candidate.data.legacy_date,
        ),
      );
      if (insertSamples.length < maxInsertSamples) {
        insertSamples.push({
          sourceRow: candidate.sourceRowNumber,
          customerId: candidate.customer_id,
          nominativo: maskNominativo(candidate.nominativoRaw),
          outcome: "inserted",
          payload: candidate.data,
        });
      }
    } else {
      summary.errors++;
      if (insertSamples.length < maxInsertSamples) {
        insertSamples.push({
          sourceRow: candidate.sourceRowNumber,
          customerId: candidate.customer_id,
          nominativo: maskNominativo(candidate.nominativoRaw),
          outcome: "error",
          detail: result.error,
          payload: candidate.data,
        });
      }
    }
  }

  const samples = [...insertSamples, ...duplicateSamples];

  if (limit !== null && candidates.length > toProcess.length) {
    console.log(
      `\n(limit) Candidati totali ${candidates.length}, processati per insert: ${toProcess.length}`,
    );
  }

  console.log("\n--- Riepilogo ---");
  console.log(`Righe CSV lette: ${summary.rowsRead}`);
  console.log(`Con note tecniche: ${summary.rowsWithNotes}`);
  console.log(`Match customer_id: ${summary.matchedCustomers}`);
  console.log(`Match ambiguo (saltate): ${summary.skippedAmbiguousMatch}`);
  console.log(`Senza match (saltate): ${summary.unmatchedCustomers}`);
  console.log(`Duplicati saltati: ${summary.skippedDuplicate}`);
  console.log(`Candidati unici pronti: ${candidates.length}`);
  console.log(`would_insert: ${summary.wouldInsert}`);
  console.log(`inserted: ${summary.inserted}`);
  console.log(`errors: ${summary.errors}`);

  console.log("\n--- Sample preview ---");
  for (const s of samples) {
    console.log(
      JSON.stringify(
        {
          sourceRow: s.sourceRow,
          customerId: s.customerId.slice(0, 8) + "…",
          nominativo: s.nominativo,
          outcome: s.outcome,
          detail: s.detail,
          payload: s.payload,
        },
        null,
        2,
      ),
    );
  }

  if (ambiguousSamples.length > 0) {
    console.log("\n--- Match ambigui (sample) ---");
    for (const s of ambiguousSamples) {
      console.log(JSON.stringify(s, null, 2));
    }
  }

  const payloadSample = insertSamples.find((s) => s.payload)?.payload;
  if (payloadSample) {
    console.log("\n--- Esempio payload jsonb (primo would_insert / inserted) ---");
    console.log(JSON.stringify(payloadSample, null, 2));
  }

  console.log("\nInsert row shape:");
  console.log(
    JSON.stringify(
      {
        customer_id: "<uuid>",
        service_type: SERVICE_TYPE,
        data: "<BossLegacyCardData>",
        salon_id: null,
        staff_id: null,
        appointment_id: null,
        created_at: "(default now())",
      },
      null,
      2,
    ),
  );
}

runImportBossTechnicalCardsLegacy().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
