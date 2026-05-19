/**
 * Carica export Boss in public.customers_import_raw (staging).
 * NON scrive su public.customers.
 *
 * Usage:
 *   npm run import:boss-customers:raw
 *   npm run import:boss-customers:raw -- --dry-run
 *   npm run import:boss-customers:raw -- --reset
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  type BossCsvColumnIndices,
  formatDateIso,
  getField,
  guessNameFromNominativo,
  isFakeBirthDate,
  normalizeEmail,
  normalizePhone,
  normalizeSex,
  parseCsvSemicolon,
  parseItalianDate,
  parseValido,
  resolveBossCsvColumns,
  rowToRawObject,
} from "./bossCustomersCsvParse.ts";

const REPO_ROOT = process.cwd();
const CSV_PATH = join(REPO_ROOT, "data/imports/clienti-boss-raw.csv");
const SOURCE = "boss";
const SOURCE_FILE = "data/imports/clienti-boss-raw.csv";
const BATCH_SIZE = 400;

type StagingRow = {
  source: string;
  source_file: string;
  source_row_number: number;
  raw: Record<string, string>;
  nominativo_raw: string | null;
  first_name_guess: string | null;
  last_name_guess: string | null;
  phone_raw: string | null;
  phone_normalized: string | null;
  email_raw: string | null;
  email_normalized: string | null;
  birth_date_raw: string | null;
  birth_date: string | null;
  sex_raw: string | null;
  sex_normalized: string | null;
  valid_raw: string | null;
  is_valid: boolean | null;
  notes_raw: string | null;
  import_status: string;
  import_warnings: string[];
};

function parseArgs(argv: string[]): { dryRun: boolean; reset: boolean } {
  return {
    dryRun: argv.includes("--dry-run"),
    reset: argv.includes("--reset"),
  };
}

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

function buildStagingRow(
  headers: string[],
  row: string[],
  sourceRowNumber: number,
  columnIndices: BossCsvColumnIndices,
): StagingRow {
  const warnings: string[] = [];
  const raw = rowToRawObject(headers, row);

  const nominativoRaw = getField(row, columnIndices.nominativo) || null;
  if (!nominativoRaw) warnings.push("nominativo_empty");

  const { first, last } = guessNameFromNominativo(nominativoRaw ?? "");
  if (nominativoRaw && !first) warnings.push("name_single_token");

  const cellulareRaw = getField(row, columnIndices.cellulare);
  const telefonoRaw = getField(row, columnIndices.telefono);
  const cellulareNorm = normalizePhone(cellulareRaw);
  const telefonoNorm = normalizePhone(telefonoRaw);

  if (cellulareNorm && telefonoNorm && cellulareNorm !== telefonoNorm) {
    warnings.push("multiple_phones");
  }

  const phoneNormalized = cellulareNorm ?? telefonoNorm;
  const phoneRaw = cellulareRaw || telefonoRaw || null;
  if ((cellulareRaw || telefonoRaw) && !phoneNormalized) {
    warnings.push("phone_invalid");
  }

  const emailRaw = getField(row, columnIndices.email) || null;
  const emailNormalized = normalizeEmail(emailRaw ?? "");
  if (emailRaw && !emailNormalized) warnings.push("email_invalid");

  const birthDateRaw = getField(row, columnIndices.dataNascita) || null;
  let birthDate: string | null = null;
  if (birthDateRaw) {
    if (isFakeBirthDate(birthDateRaw)) {
      warnings.push("birth_date_fake");
    } else {
      const parsed = parseItalianDate(birthDateRaw);
      if (parsed) birthDate = formatDateIso(parsed);
      else warnings.push("birth_date_invalid");
    }
  }

  const sex = normalizeSex(getField(row, columnIndices.sesso));
  if (sex.raw && !sex.normalized) warnings.push("sex_unmapped");

  const validRaw = getField(row, columnIndices.valido) || null;
  const isValid = parseValido(validRaw ?? "");
  if (validRaw && isValid === null) warnings.push("valid_unmapped");

  const notesRaw = getField(row, columnIndices.descrizione) || null;

  return {
    source: SOURCE,
    source_file: SOURCE_FILE,
    source_row_number: sourceRowNumber,
    raw,
    nominativo_raw: nominativoRaw,
    first_name_guess: first,
    last_name_guess: last,
    phone_raw: phoneRaw,
    phone_normalized: phoneNormalized,
    email_raw: emailRaw,
    email_normalized: emailNormalized,
    birth_date_raw: birthDateRaw,
    birth_date: birthDate,
    sex_raw: sex.raw,
    sex_normalized: sex.normalized,
    valid_raw: validRaw,
    is_valid: isValid,
    notes_raw: notesRaw,
    import_status: "raw",
    import_warnings: warnings,
  };
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

async function runLoadBossCustomersRaw(): Promise<void> {
  const { dryRun, reset } = parseArgs(process.argv.slice(2));

  if (!existsSync(CSV_PATH)) {
    console.error(`CSV non trovato: ${CSV_PATH}`);
    console.error("Copia l'export Boss in data/imports/clienti-boss-raw.csv");
    process.exit(1);
  }

  const content = readFileSync(CSV_PATH, "utf8").replace(/^\uFEFF/, "");
  const parsed = parseCsvSemicolon(content);
  if (parsed.length < 2) {
    console.error("CSV vuoto o senza righe dati.");
    process.exit(1);
  }

  const headers = parsed[0];
  const dataRows = parsed.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const columnIndices = resolveBossCsvColumns(headers);

  const stagingRows: StagingRow[] = dataRows.map((row, i) =>
    buildStagingRow(headers, row, i + 1, columnIndices),
  );

  let warningsCount = 0;
  let phonePresent = 0;
  let emailPresent = 0;

  for (const r of stagingRows) {
    if (r.import_warnings.length > 0) warningsCount++;
    if (r.phone_normalized) phonePresent++;
    if (r.email_normalized) emailPresent++;
  }

  console.log("=== Import Boss → customers_import_raw ===\n");
  console.log(`Modalità: ${dryRun ? "DRY-RUN (nessuna scrittura DB)" : "LOAD"}`);
  if (reset) console.log("Reset: SVUOTA staging boss prima del caricamento");
  console.log(`Record parsati: ${stagingRows.length}`);
  console.log(`Con telefono normalizzato: ${phonePresent}`);
  console.log(`Con email normalizzata: ${emailPresent}`);
  console.log(`Record con almeno un warning: ${warningsCount}`);

  if (dryRun) {
    console.log("\nDry-run completato. Nessuna modifica al database.");
    process.exit(0);
  }

  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  const { count: existingCount, error: countError } = await supabase
    .from("customers_import_raw")
    .select("*", { count: "exact", head: true })
    .eq("source", SOURCE);

  if (countError) {
    console.error("Verifica staging fallita:", countError.message);
    console.error("Hai eseguito supabase db push per la migration customers_import_raw?");
    process.exit(1);
  }

  if ((existingCount ?? 0) > 0 && !reset) {
    console.error(
      `\nStaging già popolata (${existingCount} righe source=boss). Usa --reset per svuotare e ricaricare.`,
    );
    process.exit(1);
  }

  if (reset) {
    const { error: deleteError } = await supabase
      .from("customers_import_raw")
      .delete()
      .eq("source", SOURCE);

    if (deleteError) {
      console.error("Reset staging fallito:", deleteError.message);
      process.exit(1);
    }
    console.log("\nStaging boss resettata.");
  }

  let inserted = 0;
  const skipped = 0;

  for (let i = 0; i < stagingRows.length; i += BATCH_SIZE) {
    const batch = stagingRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("customers_import_raw").insert(batch);

    if (error) {
      if (error.code === "23505" && !reset) {
        console.error(
          "\nConflitto unique (source, source_row_number). Usa --reset per ricaricare da zero.",
        );
        process.exit(1);
      }
      console.error(`Insert batch ${i / BATCH_SIZE + 1} fallito:`, error.message);
      process.exit(1);
    }

    inserted += batch.length;
    process.stdout.write(`\rInseriti: ${inserted}/${stagingRows.length}`);
  }

  console.log("\n\n--- Riepilogo ---");
  console.log(`Total parsed: ${stagingRows.length}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Warnings (record con ≥1): ${warningsCount}`);
  console.log(`Phone present: ${phonePresent}`);
  console.log(`Email present: ${emailPresent}`);
  console.log("\nTabella: public.customers_import_raw (public.customers NON modificata)");
}

runLoadBossCustomersRaw().catch((error: unknown) => {
  console.error("Import fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
