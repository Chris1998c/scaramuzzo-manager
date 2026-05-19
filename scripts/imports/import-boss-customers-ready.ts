/**
 * Import controllato: customers_import_ready_candidates → public.customers
 * Default: dry-run. Scrittura solo con --commit.
 *
 * Usage:
 *   npm run import:boss-customers:ready -- --dry-run
 *   npm run import:boss-customers:ready -- --commit --limit 10
 *   npm run import:boss-customers:ready -- --commit
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, normalizePhone } from "./bossCustomersCsvParse.ts";
import { maskContactKey, maskNominativo } from "./importReportMask.ts";

const REPO_ROOT = process.cwd();
const PAGE_SIZE = 500;

/**
 * Colonne insert ammesse su public.customers (schema base 20260315212845;
 * customer_code/marketing rimossi in 20260516091830_remote_schema).
 */
const FALLBACK_CUSTOMERS_INSERT_COLUMNS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "address",
  "notes",
] as const;

const CUSTOMERS_DB_MANAGED_COLUMNS = new Set(["id", "created_at"]);

/** Documentazione mapping staging → customers (solo colonne esistenti). */
const CUSTOMERS_MAPPING = {
  first_name: "customers.first_name (NOT NULL)",
  last_name: "customers.last_name (NOT NULL)",
  phone: "customers.phone (NOT NULL, unique)",
  email: "customers.email (nullable)",
  address: "customers.address (nullable, non impostato da import)",
  notes: "customers.notes (nullable, metadati import Boss)",
  not_mapped: ["birth_date", "sex", "customer_code (assente su DB remoto)"],
} as const;

type CustomerInsertPayload = {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

type ReadyCandidate = {
  id: number;
  source_row_number: number;
  nominativo_raw: string | null;
  first_name_guess: string | null;
  last_name_guess: string | null;
  phone_normalized: string | null;
  email_normalized: string | null;
  import_warnings: string[] | null;
  ready_reason: string | null;
};

type ProcessOutcome =
  | "would_insert"
  | "inserted"
  | "skipped_existing_phone"
  | "skipped_existing_email"
  | "skipped_no_contact"
  | "skipped_no_phone_for_db"
  | "skipped_already_imported"
  | "skipped_invalid_name"
  | "error";

type SampleAction = {
  stagingId: number;
  sourceRow: number;
  nominativo: string;
  phone: string | null;
  email: string | null;
  outcome: ProcessOutcome;
  detail?: string;
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

function parseArgs(argv: string[]): { commit: boolean; limit: number | null } {
  const commit = argv.includes("--commit");
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
  return { commit, limit };
}

function phoneKeys(raw: string): string[] {
  const keys = new Set<string>();
  const trimmed = raw.trim();
  if (trimmed) keys.add(trimmed);
  const norm = normalizePhone(trimmed);
  if (norm) keys.add(norm);
  return [...keys];
}

function emailKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return normalizeEmail(raw);
}

async function loadExistingContacts(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<{ phones: Set<string>; emails: Set<string> }> {
  const phones = new Set<string>();
  const emails = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("customers")
      .select("phone, email")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Lettura customers: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      for (const k of phoneKeys(String(row.phone ?? ""))) phones.add(k);
      const e = emailKey(row.email as string | null);
      if (e) emails.add(e);
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { phones, emails };
}

async function loadImportedStagingIds(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<Set<number>> {
  const ids = new Set<number>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("customers_import_raw")
      .select("id")
      .eq("source", "boss")
      .eq("import_status", "imported")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Lettura staging imported: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) ids.add(row.id as number);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return ids;
}

async function fetchReadyCandidates(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  limit: number | null,
): Promise<ReadyCandidate[]> {
  const all: ReadyCandidate[] = [];
  let offset = 0;

  for (;;) {
    const end = offset + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("customers_import_ready_candidates")
      .select(
        "id, source_row_number, nominativo_raw, first_name_guess, last_name_guess, phone_normalized, email_normalized, import_warnings, ready_reason",
      )
      .order("source_row_number", { ascending: true })
      .range(offset, end);

    if (error) throw new Error(`Lettura ready candidates: ${error.message}`);
    if (!data?.length) break;

    all.push(...(data as ReadyCandidate[]));
    if (limit !== null && all.length >= limit) {
      return all.slice(0, limit);
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return limit !== null ? all.slice(0, limit) : all;
}

function resolveNames(candidate: ReadyCandidate): { first_name: string; last_name: string } | null {
  const last = (candidate.last_name_guess ?? "").trim();
  const first = (candidate.first_name_guess ?? "").trim();
  const nominativo = (candidate.nominativo_raw ?? "").trim();

  const lastName = last || nominativo;
  if (!lastName) return null;

  const firstName = first || "—";
  return { first_name: firstName, last_name: lastName };
}

function buildNotes(candidate: ReadyCandidate): string | null {
  const parts: string[] = [];
  if (candidate.nominativo_raw?.trim()) {
    parts.push(`Import Boss — ${candidate.nominativo_raw.trim()}`);
  }
  const warnings = candidate.import_warnings ?? [];
  if (warnings.length > 0) {
    parts.push(`Warnings: ${warnings.join(", ")}`);
  }
  parts.push(`Boss CSV row ${candidate.source_row_number}`);
  return parts.join("\n").trim() || null;
}

function toInsertRow(candidate: ReadyCandidate): CustomerInsertPayload | null {
  const names = resolveNames(candidate);
  const phone = candidate.phone_normalized?.trim();
  if (!names || !phone) return null;

  return {
    first_name: names.first_name,
    last_name: names.last_name,
    phone,
    email: candidate.email_normalized ?? null,
    notes: buildNotes(candidate),
  };
}

async function resolveCustomersInsertColumns(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data, error } = await supabase.from("customers").select("*").limit(1);
  if (error) {
    console.warn(
      `Probe colonne customers fallito (${error.message}); uso fallback migrations.`,
    );
    return new Set(FALLBACK_CUSTOMERS_INSERT_COLUMNS);
  }

  const sample = data?.[0];
  if (!sample || typeof sample !== "object") {
    return new Set(FALLBACK_CUSTOMERS_INSERT_COLUMNS);
  }

  const writable = Object.keys(sample).filter(
    (key) => !CUSTOMERS_DB_MANAGED_COLUMNS.has(key),
  );
  return new Set(writable);
}

function validateInsertPayload(
  row: CustomerInsertPayload,
  allowedColumns: Set<string>,
): { ok: true; payload: Record<string, string | null> } | { ok: false; reason: string } {
  const unknown = Object.keys(row).filter((k) => !allowedColumns.has(k));
  if (unknown.length > 0) {
    return { ok: false, reason: `campi non presenti su customers: ${unknown.join(", ")}` };
  }

  const payload: Record<string, string | null> = {};
  for (const key of allowedColumns) {
    if (!(key in row)) continue;
    const value = row[key as keyof CustomerInsertPayload];
    if (value === undefined) continue;
    payload[key] = value === null ? null : String(value).trim();
  }

  if (!payload.first_name) return { ok: false, reason: "first_name vuoto" };
  if (!payload.last_name) return { ok: false, reason: "last_name vuoto" };
  if (!payload.phone) return { ok: false, reason: "phone vuoto" };

  return { ok: true, payload };
}

async function insertCustomer(
  supabase: SupabaseClient,
  row: CustomerInsertPayload,
  allowedColumns: Set<string>,
): Promise<{ id: string | null; error: string | null }> {
  const validated = validateInsertPayload(row, allowedColumns);
  if (!validated.ok) {
    return { id: null, error: validated.reason };
  }

  const { data, error } = await supabase
    .from("customers")
    .insert(validated.payload)
    .select("id")
    .single();

  if (error) {
    return { id: null, error: error.message };
  }

  const id = data?.id != null ? String(data.id) : null;
  if (!id) return { id: null, error: "Insert cliente: nessun id restituito" };
  return { id, error: null };
}

function classifyCandidate(
  candidate: ReadyCandidate,
  existing: { phones: Set<string>; emails: Set<string> },
  importedIds: Set<number>,
): { outcome: ProcessOutcome; detail?: string } {
  if (importedIds.has(candidate.id)) {
    return { outcome: "skipped_already_imported" };
  }

  const phone = candidate.phone_normalized?.trim() ?? null;
  const email = candidate.email_normalized ?? null;

  if (!phone && !email) {
    return { outcome: "skipped_no_contact" };
  }

  if (!phone) {
    return {
      outcome: "skipped_no_phone_for_db",
      detail: "ready_reason email senza telefono; customers.phone è NOT NULL",
    };
  }

  for (const key of phoneKeys(phone)) {
    if (existing.phones.has(key)) {
      return { outcome: "skipped_existing_phone" };
    }
  }

  const eKey = emailKey(email);
  if (eKey && existing.emails.has(eKey)) {
    return { outcome: "skipped_existing_email" };
  }

  if (!resolveNames(candidate)) {
    return { outcome: "skipped_invalid_name" };
  }

  return { outcome: "would_insert" };
}

function toSample(
  candidate: ReadyCandidate,
  outcome: ProcessOutcome,
  detail?: string,
): SampleAction {
  return {
    stagingId: candidate.id,
    sourceRow: candidate.source_row_number,
    nominativo: maskNominativo(candidate.nominativo_raw),
    phone: candidate.phone_normalized ? maskContactKey(candidate.phone_normalized) : null,
    email: candidate.email_normalized ? maskContactKey(candidate.email_normalized) : null,
    outcome,
    detail,
  };
}

async function runImportBossCustomersReady(): Promise<void> {
  const { commit, limit } = parseArgs(process.argv.slice(2));
  const dryRun = !commit;

  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  console.log("=== Import Boss ready → customers ===\n");
  console.log(`Modalità: ${dryRun ? "DRY-RUN (nessuna scrittura)" : "COMMIT"}`);
  if (limit !== null) console.log(`Limit: ${limit} candidati`);
  console.log("\nMapping public.customers:");
  console.log(JSON.stringify(CUSTOMERS_MAPPING, null, 2));

  const [candidates, existing, importedIds, allowedInsertColumns] = await Promise.all([
    fetchReadyCandidates(supabase, limit),
    loadExistingContacts(supabase),
    loadImportedStagingIds(supabase),
    resolveCustomersInsertColumns(supabase),
  ]);

  const missingRequired = ["first_name", "last_name", "phone"].filter(
    (c) => !allowedInsertColumns.has(c),
  );
  if (missingRequired.length > 0) {
    console.error(
      `Schema customers incompatibile: mancano colonne obbligatorie ${missingRequired.join(", ")}`,
    );
    process.exit(1);
  }

  console.log(
    `\nColonne insert ammesse (probe DB): ${[...allowedInsertColumns].sort().join(", ")}`,
  );

  const summary = {
    candidatesRead: candidates.length,
    wouldInsert: 0,
    inserted: 0,
    skippedExistingPhone: 0,
    skippedExistingEmail: 0,
    skippedNoContact: 0,
    skippedNoPhoneForDb: 0,
    skippedAlreadyImported: 0,
    skippedInvalidName: 0,
    errors: 0,
  };

  const samples: SampleAction[] = [];
  const maxSamples = 15;

  for (const candidate of candidates) {
    const { outcome, detail } = classifyCandidate(candidate, existing, importedIds);

    switch (outcome) {
      case "would_insert":
        if (dryRun) summary.wouldInsert++;
        break;
      case "skipped_existing_phone":
        summary.skippedExistingPhone++;
        break;
      case "skipped_existing_email":
        summary.skippedExistingEmail++;
        break;
      case "skipped_no_contact":
        summary.skippedNoContact++;
        break;
      case "skipped_no_phone_for_db":
        summary.skippedNoPhoneForDb++;
        break;
      case "skipped_already_imported":
        summary.skippedAlreadyImported++;
        break;
      case "skipped_invalid_name":
        summary.skippedInvalidName++;
        break;
      default:
        break;
    }

    if (samples.length < maxSamples && outcome !== "skipped_already_imported") {
      samples.push(toSample(candidate, outcome, detail));
    }

    if (dryRun || outcome !== "would_insert") continue;

    const row = toInsertRow(candidate);
    if (!row) {
      summary.errors++;
      if (samples.length < maxSamples) {
        samples.push(toSample(candidate, "error", "mapping fallito"));
      }
      continue;
    }

    const { id: customerId, error: insertError } = await insertCustomer(
      supabase,
      row,
      allowedInsertColumns,
    );
    if (insertError || !customerId) {
      summary.errors++;
      if (samples.length < maxSamples) {
        samples.push(toSample(candidate, "error", insertError ?? "insert fallito"));
      }
      continue;
    }
    const { error: upErr } = await supabase
      .from("customers_import_raw")
      .update({
        import_status: "imported",
        imported_customer_id: customerId,
      })
      .eq("id", candidate.id);

    if (upErr) {
      summary.errors++;
      if (samples.length < maxSamples) {
        samples.push(toSample(candidate, "error", `staging update: ${upErr.message}`));
      }
      continue;
    }

    summary.inserted++;

    for (const key of phoneKeys(row.phone)) existing.phones.add(key);
    const eKey = emailKey(row.email);
    if (eKey) existing.emails.add(eKey);
    importedIds.add(candidate.id);

    if (summary.inserted % 100 === 0) {
      process.stdout.write(`\rInseriti: ${summary.inserted}`);
    }
  }

  if (commit && summary.inserted > 0) process.stdout.write("\n");

  console.log("\n--- Riepilogo ---");
  console.log(`Candidates letti: ${summary.candidatesRead}`);
  if (dryRun) {
    console.log(`Would insert: ${summary.wouldInsert}`);
  } else {
    console.log(`Inserted: ${summary.inserted}`);
  }
  console.log(`Skipped existing phone: ${summary.skippedExistingPhone}`);
  console.log(`Skipped existing email: ${summary.skippedExistingEmail}`);
  console.log(`Skipped no contact: ${summary.skippedNoContact}`);
  console.log(`Skipped no phone (DB richiede phone): ${summary.skippedNoPhoneForDb}`);
  console.log(`Skipped già imported in staging: ${summary.skippedAlreadyImported}`);
  console.log(`Skipped nome invalido: ${summary.skippedInvalidName}`);
  console.log(`Errors: ${summary.errors}`);

  console.log("\n--- Sample azioni (mascherate) ---");
  for (const s of samples) {
    const extra = s.detail ? ` — ${s.detail}` : "";
    console.log(
      `  #${s.sourceRow} ${s.nominativo} | ${s.outcome}${extra}`,
    );
  }

  if (dryRun) {
    console.log("\nNessuna modifica a public.customers o staging.");
    console.log("Per import reale: aggiungi --commit (opz. --limit N).");
  } else {
    console.log("\nStaging aggiornata (import_status=imported) per insert riusciti.");
  }
}

runImportBossCustomersReady().catch((error: unknown) => {
  console.error("Import fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
