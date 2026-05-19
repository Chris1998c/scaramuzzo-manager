/**
 * Report analisi staging customers_import_raw (read-only, no public.customers).
 * Usage: npm run report:boss-customers-analysis
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { maskContactKey, maskNominativo } from "./importReportMask.ts";

const REPO_ROOT = process.cwd();
const REPORT_PATH = join(REPO_ROOT, "data/imports/clienti-boss-analysis-report.json");
const SOURCE = "boss";

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

async function countView(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  view: string,
  filters?: { column: string; value: string | boolean }[],
): Promise<number> {
  let q = supabase.from(view).select("*", { count: "exact", head: true });
  for (const f of filters ?? []) {
    q = q.eq(f.column, f.value);
  }
  const { count, error } = await q;
  if (error) throw new Error(`${view}: ${error.message}`);
  return count ?? 0;
}

async function sumDuplicateRecords(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  view: "customers_import_duplicate_phone" | "customers_import_duplicate_email",
): Promise<{ groups: number; recordsInvolved: number }> {
  const pageSize = 1000;
  let offset = 0;
  let groups = 0;
  let recordsInvolved = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(view)
      .select("duplicate_count")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`${view}: ${error.message}`);
    if (!data?.length) break;

    for (const row of data as { duplicate_count: number }[]) {
      groups++;
      recordsInvolved += row.duplicate_count;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return { groups, recordsInvolved };
}

async function runBossCustomersAnalysisReport(): Promise<void> {
  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  const { count: totalStaging, error: totalError } = await supabase
    .from("customers_import_raw")
    .select("id", { count: "exact", head: true })
    .eq("source", SOURCE);

  if (totalError) throw new Error(totalError.message);

  const [
    readyTotal,
    noContact,
    phoneDupes,
    emailDupes,
    warningsRes,
    readyPhoneRes,
    readyEmailRes,
    readyStrictRes,
    topPhoneRes,
    topEmailRes,
  ] = await Promise.all([
    countView(supabase, "customers_import_ready_candidates"),
    countView(supabase, "customers_import_no_contact"),
    sumDuplicateRecords(supabase, "customers_import_duplicate_phone"),
    sumDuplicateRecords(supabase, "customers_import_duplicate_email"),
    supabase.from("customers_import_warning_summary").select("warning_code, record_count"),
    countView(supabase, "customers_import_ready_candidates", [
      { column: "ready_reason", value: "unique_phone" },
    ]),
    countView(supabase, "customers_import_ready_candidates", [
      { column: "ready_reason", value: "unique_email_only" },
    ]),
    countView(supabase, "customers_import_ready_candidates", [
      { column: "has_important_warning", value: false },
    ]),
    supabase
      .from("customers_import_duplicate_phone")
      .select(
        "phone_normalized, duplicate_count, first_nominativo, last_nominativo",
      )
      .order("duplicate_count", { ascending: false })
      .limit(20),
    supabase
      .from("customers_import_duplicate_email")
      .select(
        "email_normalized, duplicate_count, first_nominativo, last_nominativo",
      )
      .order("duplicate_count", { ascending: false })
      .limit(20),
  ]);

  if (warningsRes.error) throw new Error(warningsRes.error.message);
  if (topPhoneRes.error) throw new Error(topPhoneRes.error.message);
  if (topEmailRes.error) throw new Error(topEmailRes.error.message);

  const readyUniquePhone = readyPhoneRes;
  const readyUniqueEmailOnly = readyEmailRes;
  const readyWithoutImportantWarning = readyStrictRes;

  const importantWarningCodes = new Set([
    "birth_date_fake",
    "phone_invalid",
    "email_invalid",
  ]);

  const warningSummary = (warningsRes.data ?? []).map((w) => ({
    code: w.warning_code as string,
    recordCount: Number(w.record_count),
    important: importantWarningCodes.has(w.warning_code as string),
  }));

  const topWarnings = [...warningSummary]
    .sort((a, b) => b.recordCount - a.recordCount)
    .slice(0, 15);

  const topPhoneDuplicates = (topPhoneRes.data ?? []).map((r) => ({
    phone: maskContactKey(String(r.phone_normalized)),
    count: r.duplicate_count as number,
    firstNominativo: maskNominativo(r.first_nominativo as string | null),
    lastNominativo: maskNominativo(r.last_nominativo as string | null),
  }));

  const topEmailDuplicates = (topEmailRes.data ?? []).map((r) => ({
    email: maskContactKey(String(r.email_normalized)),
    count: r.duplicate_count as number,
    firstNominativo: maskNominativo(r.first_nominativo as string | null),
    lastNominativo: maskNominativo(r.last_nominativo as string | null),
  }));

  const duplicatePhoneRecords = phoneDupes.recordsInvolved;
  const duplicateEmailRecords = emailDupes.recordsInvolved;
  const withContact = totalStaging! - noContact;
  const notReadyWithContact = Math.max(0, withContact - readyTotal);

  const report = {
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    totals: {
      stagingRecords: totalStaging,
      withContact,
      noContact,
    },
    classification: {
      readyCandidates: readyTotal,
      readyUniquePhone,
      readyUniqueEmailOnly,
      duplicatePhoneGroups: phoneDupes.groups,
      duplicatePhoneRecords,
      duplicateEmailGroups: emailDupes.groups,
      duplicateEmailRecords,
      noContact,
      notReadyWithContact,
    },
    safeImportEstimate: {
      lenientReady: readyTotal,
      strictReadyNoImportantWarnings: readyWithoutImportantWarning,
      description:
        "lenient = contatto univoco; strict = ready senza birth_date_fake / phone_invalid / email_invalid",
    },
    topWarnings,
    topPhoneDuplicates,
    topEmailDuplicates,
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Analisi staging clienti Boss ===\n");
  console.log(`Record in staging (boss): ${totalStaging}`);
  console.log(`Con contatto (tel o email norm.): ${withContact}`);
  console.log(`Senza contatti (view no_contact): ${noContact}`);
  console.log(`\n--- Importabilità ---`);
  console.log(`Ready (contatto univoco): ${readyTotal}`);
  console.log(`  · telefono univoco: ${readyUniquePhone}`);
  console.log(`  · solo email univoca: ${readyUniqueEmailOnly}`);
  console.log(
    `Stima import sicuro (strict, no warning critici): ${readyWithoutImportantWarning}`,
  );
  console.log(`\n--- Duplicati ---`);
  console.log(
    `Telefono: ${phoneDupes.groups} gruppi, ${duplicatePhoneRecords} record coinvolti`,
  );
  console.log(
    `Email: ${emailDupes.groups} gruppi, ${duplicateEmailRecords} record coinvolti`,
  );
  console.log(`Con contatto ma NON ready: ${notReadyWithContact}`);
  console.log(`\n--- Top warning ---`);
  for (const w of topWarnings.slice(0, 8)) {
    const tag = w.important ? " [importante]" : "";
    console.log(`  ${w.code}: ${w.recordCount}${tag}`);
  }
  console.log(`\n--- Top duplicati telefono (mascherati) ---`);
  for (const d of topPhoneDuplicates.slice(0, 8)) {
    console.log(`  ${d.phone} → ${d.count} record`);
  }
  console.log(`\n--- Top duplicati email (mascherate) ---`);
  for (const d of topEmailDuplicates.slice(0, 8)) {
    console.log(`  ${d.email} → ${d.count} record`);
  }
  console.log(`\nReport JSON: ${REPORT_PATH}`);
  console.log("\npublic.customers NON modificata.");
}

runBossCustomersAnalysisReport().catch((error: unknown) => {
  console.error("Report fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
