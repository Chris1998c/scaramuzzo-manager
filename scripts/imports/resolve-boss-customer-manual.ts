/**
 * Risoluzione manuale mirata: assegna un telefono Boss duplicato al nominativo scelto.
 *
 * Usage:
 *   npm run resolve:boss-customer-manual -- --dry-run --phone 3470914731 --keep "CARMEN MURACA"
 *   npm run resolve:boss-customer-manual -- --commit --phone 3470914731 --keep "CARMEN MURACA"
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getField,
  normalizeEmail,
  normalizeNominativo,
  normalizePhone,
  parseCsvSemicolon,
} from "./bossCustomersCsvParse.ts";
import { phoneKeys } from "./bossTechnicalCardsMatch.ts";
import {
  bossTechnicalNoteOriginalText,
  classifyBossTechnicalNote,
  parseBossLegacyDate,
  resolveBossTechnicalCardsColumns,
  type Confidence,
  type ServiceTypeGuess,
} from "./bossTechnicalCardsClassify.ts";

type BossLegacyCardData = {
  source: "boss";
  original_text: string;
  legacy_guess: ServiceTypeGuess;
  confidence: Confidence;
  legacy_date: string | null;
  legacy_tipo_nota: string | null;
  warnings: string[];
  import_version: number;
};

const REPO_ROOT = process.cwd();
const TECH_CSV_PATH = join(
  REPO_ROOT,
  "data/imports/boss-technical-cards/T1591_N1_elenco_clienti.csv",
);
const SOURCE = "boss";
const SERVICE_TYPE = "legacy_note";
const PAGE_SIZE = 500;

const MANUAL_WARN = "manual_duplicate_phone_wrong_customer";
const RESOLVED_OWNER_PREFIX = "resolved_phone_owner:";

type StagingRow = {
  id: number;
  nominativo_raw: string | null;
  phone_raw: string | null;
  phone_normalized: string | null;
  email_raw: string | null;
  email_normalized: string | null;
  import_status: string;
  import_warnings: string[] | null;
  imported_customer_id: string | null;
};

type Args = {
  dryRun: boolean;
  phone: string;
  keepNominativo: string;
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

function parseArgs(argv: string[]): Args {
  const commit = argv.includes("--commit");
  const dryRun = argv.includes("--dry-run") || !commit;

  const phoneIdx = argv.indexOf("--phone");
  const keepIdx = argv.indexOf("--keep");
  if (phoneIdx < 0 || !argv[phoneIdx + 1]) {
    console.error("Richiesto: --phone <numero>");
    process.exit(1);
  }
  if (keepIdx < 0 || !argv[keepIdx + 1]) {
    console.error('Richiesto: --keep "NOMINATIVO"');
    process.exit(1);
  }

  const phoneNorm = normalizePhone(argv[phoneIdx + 1]!) ?? argv[phoneIdx + 1]!.replace(/\D/g, "");
  if (!phoneNorm) {
    console.error("Telefono non valido");
    process.exit(1);
  }

  return {
    dryRun,
    phone: phoneNorm,
    keepNominativo: argv[keepIdx + 1]!.trim(),
  };
}

function nominativoMatchesKeep(raw: string | null, keepKey: string): boolean {
  if (!raw?.trim()) return false;
  return normalizeNominativo(raw).key === keepKey;
}

function appendWarnings(existing: string[] | null, extra: string[]): string[] {
  const base = [...(existing ?? [])];
  for (const w of extra) {
    if (!base.includes(w)) base.push(w);
  }
  return base;
}

function dedupeKey(customerId: string, originalText: string, legacyDate: string | null): string {
  const text = originalText.replace(/\r\n/g, "\n").trim();
  return `${customerId}|${legacyDate ?? ""}|${text}`;
}

async function legacyNoteAllowed(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase
    .from("customer_service_cards")
    .select("id")
    .eq("service_type", SERVICE_TYPE)
    .limit(1);

  return !error;
}

async function findExistingCustomer(
  supabase: SupabaseClient,
  phone: string,
  keepKey: string,
): Promise<{ id: string; source: string; row: Record<string, unknown> } | null> {
  for (const key of phoneKeys(phone)) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email, notes")
      .eq("phone", key)
      .maybeSingle();

    if (error) throw new Error(`Ricerca per phone: ${error.message}`);
    if (data?.id) {
      return { id: String(data.id), source: `phone:${key}`, row: data as Record<string, unknown> };
    }
  }

  const { data: byName, error: nameErr } = await supabase
    .from("customers")
    .select("id, first_name, last_name, phone, email, notes")
    .ilike("first_name", "carmen")
    .ilike("last_name", "muraca");

  if (nameErr) throw new Error(`Ricerca per nome: ${nameErr.message}`);
  if (byName?.length === 1) {
    return {
      id: String(byName[0]!.id),
      source: "name:carmen+muraca",
      row: byName[0] as Record<string, unknown>,
    };
  }
  if (byName && byName.length > 1) {
    const exact = byName.find(
      (r) =>
        `${String(r.last_name ?? "")} ${String(r.first_name ?? "")}`.trim().toUpperCase() ===
        keepKey,
    );
    if (exact?.id) {
      return {
        id: String(exact.id),
        source: "name:exact_nominativo",
        row: exact as Record<string, unknown>,
      };
    }
  }

  return null;
}

async function loadStagingByPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<StagingRow[]> {
  const keys = new Set(phoneKeys(phone));
  keys.add(phone);

  const { data, error } = await supabase
    .from("customers_import_raw")
    .select(
      "id, nominativo_raw, phone_raw, phone_normalized, email_raw, email_normalized, import_status, import_warnings, imported_customer_id",
    )
    .eq("source", SOURCE)
    .eq("phone_normalized", phone);

  if (error) throw new Error(`Staging: ${error.message}`);
  return (data ?? []) as StagingRow[];
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
  const warnings = [...classification.warnings, "manual_resolve_carmen_muraca"];
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
    import_version: 1,
  };
}

function scanTechnicalCardsForCustomer(
  customerId: string,
  phone: string,
  keepKey: string,
  existingDedup: Set<string>,
): Array<{ sourceRow: number; data: BossLegacyCardData; dedupeKey: string }> {
  if (!existsSync(TECH_CSV_PATH)) return [];

  const raw = readFileSync(TECH_CSV_PATH, "utf8").replace(/^\uFEFF/, "");
  const parsed = parseCsvSemicolon(raw);
  const headers = parsed[0] ?? [];
  const cols = resolveBossTechnicalCardsColumns(headers);
  const phoneLookup = new Set(phoneKeys(phone));

  const out: Array<{ sourceRow: number; data: BossLegacyCardData; dedupeKey: string }> = [];

  for (let i = 0; i < parsed.slice(1).length; i++) {
    const row = parsed[i + 1]!;
    if (!row.some((c) => c.trim() !== "")) continue;

    const nominativo = getField(row, cols.nominativo);
    const nomKey = normalizeNominativo(nominativo).key;
    const phones = [
      getField(row, cols.telefono),
      getField(row, cols.cellulare),
      getField(row, cols.altroTelefono),
    ];
    const phoneHit = phones.some((p) => phoneKeys(p).some((k) => phoneLookup.has(k)));

    if (nomKey !== keepKey && !phoneHit) continue;

    const parts = {
      noteTecnicheBase: getField(row, cols.noteTecnicheBase),
      consigli: getField(row, cols.consigli),
      noteTecnicheAvanzate: getField(row, cols.noteTecnicheAvanzate),
    };
    const hasNotes =
      parts.noteTecnicheBase !== "" ||
      parts.consigli !== "" ||
      parts.noteTecnicheAvanzate !== "";
    if (!hasNotes) continue;

    const data = buildLegacyPayload(
      parts,
      getField(row, cols.data),
      getField(row, cols.tipoNota),
    );
    const key = dedupeKey(customerId, data.original_text, data.legacy_date);
    if (existingDedup.has(key)) continue;

    out.push({ sourceRow: i + 2, data, dedupeKey: key });
  }

  return out;
}

async function loadExistingLegacyDedupKeys(
  supabase: SupabaseClient,
  customerId: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("customer_service_cards")
      .select("data")
      .eq("customer_id", customerId)
      .eq("service_type", SERVICE_TYPE)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Legacy cards: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      const payload = row.data as Record<string, unknown> | null;
      if (!payload || payload.source !== "boss") continue;
      const original = String(payload.original_text ?? "").replace(/\r\n/g, "\n").trim();
      const legacyDate =
        payload.legacy_date != null && String(payload.legacy_date).trim() !== ""
          ? String(payload.legacy_date)
          : null;
      keys.add(dedupeKey(customerId, original, legacyDate));
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return keys;
}

async function runResolveBossCustomerManual(): Promise<void> {
  if (!existsSync(join(REPO_ROOT, ".env.local"))) {
    console.error("Richiesto .env.local");
    process.exit(1);
  }

  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  const supabase = createSupabaseAdmin();
  const keepKey = normalizeNominativo(args.keepNominativo).key;
  const resolvedOwnerWarning = `${RESOLVED_OWNER_PREFIX}${args.keepNominativo}`;

  console.log("=== Risoluzione manuale Boss (telefono duplicato) ===\n");
  console.log(`Modalità: ${args.dryRun ? "DRY-RUN" : "COMMIT"}`);
  console.log(`Phone: ${args.phone}`);
  console.log(`Keep nominativo: ${args.keepNominativo} (key: ${keepKey})\n`);

  const stagingRows = await loadStagingByPhone(supabase, args.phone);
  const keepRow = stagingRows.find((r) => nominativoMatchesKeep(r.nominativo_raw, keepKey));
  const duplicateRows = stagingRows.filter((r) => r.id !== keepRow?.id);

  if (!keepRow) {
    console.error(
      `Nessuna riga staging con phone=${args.phone} e nominativo=${args.keepNominativo}.`,
    );
    console.error(
      "Righe trovate:",
      stagingRows.map((r) => ({ id: r.id, nominativo: r.nominativo_raw })),
    );
    process.exit(1);
  }

  const existing = await findExistingCustomer(supabase, args.phone, keepKey);
  let customerId = existing?.id ?? null;
  let customerAction: "existing" | "would_create" | "created" = existing
    ? "existing"
    : "would_create";

  const legacyAllowed = await legacyNoteAllowed(supabase);

  const errors: string[] = [];
  const report: Record<string, unknown> = {
    staging: {
      phone: args.phone,
      keepRow: {
        id: keepRow.id,
        nominativo_raw: keepRow.nominativo_raw,
        import_status: keepRow.import_status,
        imported_customer_id: keepRow.imported_customer_id,
      },
      duplicateRows: duplicateRows.map((r) => ({
        id: r.id,
        nominativo_raw: r.nominativo_raw,
        import_status: r.import_status,
      })),
    },
    customer: existing
      ? { action: "existing", id: existing.id, matchedVia: existing.source, ...existing.row }
      : {
          action: customerAction,
          wouldInsert: {
            first_name: "CARMEN",
            last_name: "MURACA",
            phone: args.phone,
            email:
              normalizeEmail(keepRow.email_normalized ?? keepRow.email_raw ?? "") ??
              "carmen@scaramuzzo.eu",
            notes:
              "Import Boss manual resolve — CARMEN MURACA — phone duplicate group resolved",
          },
        },
    legacy: {
      schemaAllowsLegacyNote: legacyAllowed,
      foundInCsv: 0,
      wouldInsert: 0,
      inserted: 0,
      skippedDuplicate: 0,
      errors: [] as string[],
    },
    errors,
  };

  if (!args.dryRun) {
    if (!customerId) {
      const email =
        normalizeEmail(keepRow.email_normalized ?? keepRow.email_raw ?? "") ??
        "carmen@scaramuzzo.eu";
      const { data: created, error: createErr } = await supabase
        .from("customers")
        .insert({
          first_name: "CARMEN",
          last_name: "MURACA",
          phone: args.phone,
          email,
          notes:
            "Import Boss manual resolve — CARMEN MURACA — phone duplicate group resolved",
        })
        .select("id, first_name, last_name, phone, email")
        .single();

      if (createErr) {
        errors.push(`create customer: ${createErr.message}`);
        console.log(JSON.stringify(report, null, 2));
        process.exit(1);
      }
      customerId = String(created!.id);
      customerAction = "created";
      report.customer = { action: "created", row: created };
    }

    const nowIso = new Date().toISOString();
    const { error: keepErr } = await supabase
      .from("customers_import_raw")
      .update({
        import_status: "imported",
        imported_customer_id: customerId,
        imported_at: nowIso,
        import_warnings: appendWarnings(keepRow.import_warnings, [
          "manual_resolve_phone_owner",
        ]),
      })
      .eq("id", keepRow.id);

    if (keepErr) errors.push(`update keep row: ${keepErr.message}`);

    for (const dup of duplicateRows) {
      const { error: dupErr } = await supabase
        .from("customers_import_raw")
        .update({
          import_status: "skipped",
          import_warnings: appendWarnings(dup.import_warnings, [
            MANUAL_WARN,
            resolvedOwnerWarning,
          ]),
        })
        .eq("id", dup.id);

      if (dupErr) errors.push(`skip row ${dup.id}: ${dupErr.message}`);
    }
  }

  const customerIdForLegacy = customerId ?? "dry-run-placeholder";
  const dedupKeys = customerId
    ? await loadExistingLegacyDedupKeys(supabase, customerId)
    : new Set<string>();

  const legacyCandidates = scanTechnicalCardsForCustomer(
    customerIdForLegacy,
    args.phone,
    keepKey,
    dedupKeys,
  );

  (report.legacy as Record<string, unknown>).foundInCsv = legacyCandidates.length;
  (report.legacy as Record<string, unknown>).samples = legacyCandidates.slice(0, 3).map((c) => ({
    sourceRow: c.sourceRow,
    legacy_date: c.data.legacy_date,
    preview: c.data.original_text.slice(0, 80),
  }));

  if (!legacyAllowed) {
    (report.legacy as Record<string, unknown>).skippedReason =
      "service_type legacy_note non disponibile (CHECK constraint)";
  } else if (args.dryRun) {
    (report.legacy as Record<string, unknown>).wouldInsert = legacyCandidates.length;
  } else if (customerId) {
    let inserted = 0;
    let skippedDuplicate = 0;
    const legacyErrors: string[] = [];

    for (const card of legacyCandidates) {
      if (dedupKeys.has(card.dedupeKey)) {
        skippedDuplicate++;
        continue;
      }

      const { error: insErr } = await supabase.from("customer_service_cards").insert({
        customer_id: customerId,
        service_type: SERVICE_TYPE,
        data: card.data,
      });

      if (insErr) {
        legacyErrors.push(`row ${card.sourceRow}: ${insErr.message}`);
        continue;
      }
      dedupKeys.add(card.dedupeKey);
      inserted++;
    }

    (report.legacy as Record<string, unknown>).inserted = inserted;
    (report.legacy as Record<string, unknown>).skippedDuplicate = skippedDuplicate;
    (report.legacy as Record<string, unknown>).errors = legacyErrors;
  }

  console.log("--- Riepilogo ---");
  console.log(`Staging righe con phone ${args.phone}: ${stagingRows.length}`);
  console.log(`Keep row id: ${keepRow.id} (${keepRow.nominativo_raw})`);
  console.log(`Duplicate rows da marcare skipped: ${duplicateRows.length}`);
  for (const d of duplicateRows) {
    console.log(`  - id ${d.id}: ${d.nominativo_raw}`);
  }

  console.log(`\nCliente: ${customerAction}`);
  if (existing) {
    console.log(`  id: ${existing.id} (via ${existing.source})`);
  } else if (args.dryRun) {
    console.log("  would_create Carmen Muraca con phone", args.phone);
  }

  console.log(`\nSchede legacy (CSV): ${legacyCandidates.length} candidate`);
  console.log(`  legacy_note ammesso: ${legacyAllowed ? "sì" : "no"}`);
  if (args.dryRun) {
    console.log(`  would_insert: ${legacyCandidates.length}`);
  } else {
    console.log(`  inserted: ${(report.legacy as Record<string, unknown>).inserted ?? 0}`);
  }

  if (errors.length > 0) {
    console.log("\nErrori:", errors);
  }

  console.log("\n--- Report JSON ---");
  console.log(JSON.stringify(report, null, 2));
}

runResolveBossCustomerManual().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
