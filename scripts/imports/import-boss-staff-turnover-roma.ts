/**
 * Import fatturato collaboratori Boss LAV002 (solo Roma, IVA inclusa).
 * Nominativi storici: boss_name + boss_code, staff_id sempre NULL.
 * Periodo assente nel file → period_confirmed=false (non filtrare per data).
 * Default dry-run.
 *
 * Usage:
 *   npm run import:boss-staff-turnover:roma -- --dry-run
 *   npm run import:boss-staff-turnover:roma -- --commit
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import {
  BOSS_LAV002_ROMA_UNCONFIRMED_BATCH,
  centsToEuros,
  parseBossLav002Sheet,
} from "../../lib/imports/bossLav002XlsParse.ts";

const REPO_ROOT = process.cwd();
const DEFAULT_FILE = join(
  REPO_ROOT,
  "data/imports/staff-boss-roma/LAV002-Lavoranti_Dettagli_Servizi_e_Vendita-17-11-2026_17-26.xls",
);
const SALON_ID = 1;
const SALON_NAME = "Roma";
const PERIOD_NOTE =
  "Periodo assente nel file LAV002: storico da verificare, non attribuire a filtri data finché non confermato.";

function loadEnvLocal() {
  const envPath = join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function createServiceClient(): SupabaseClient {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseLav002File(path: string) {
  const buf = readFileSync(path);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0] ?? "";
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: "",
  }) as unknown[][];
  return parseBossLav002Sheet(rows, sheetName);
}

async function main() {
  const commit = hasFlag("--commit");
  const dryRun = !commit || hasFlag("--dry-run");
  const filePath = argValue("--file") ?? DEFAULT_FILE;

  if (!existsSync(filePath)) {
    console.error(`File mancante: ${filePath}`);
    process.exit(1);
  }

  const parsed = parseLav002File(filePath);
  const sourceFile = filePath.replace(REPO_ROOT + "/", "");
  const sourceBatch = BOSS_LAV002_ROMA_UNCONFIRMED_BATCH;

  const rows = parsed.collaborators.map((c) => ({
    salon_id: SALON_ID,
    period_from: null as string | null,
    period_to: null as string | null,
    period_confirmed: false,
    boss_name: c.bossName,
    boss_code: c.bossCode,
    staff_id: null as number | null,
    amount_gross: centsToEuros(c.totalGrossCents),
    services_gross: centsToEuros(c.servicesGrossCents),
    products_gross: centsToEuros(c.productsGrossCents),
    qty_total: c.totalQty,
    match_status: "historical" as const,
    source_batch: sourceBatch,
    source_file: sourceFile,
    period_note: PERIOD_NOTE,
    amount_cents: c.totalGrossCents,
  }));

  const report = {
    salon_id: SALON_ID,
    salon: SALON_NAME,
    file: sourceFile,
    sheet: parsed.sheetName,
    collaborators: rows.length,
    period_in_file: false,
    period_confirmed: false,
    staff_links: false,
    source_batch: sourceBatch,
    parse_warnings: parsed.warnings,
    totals: {
      grand_total_cents: parsed.grandTotalCents,
      grand_total_euros: centsToEuros(parsed.grandTotalCents),
    },
    mapping: rows.map((r) => ({
      boss_code: r.boss_code,
      boss_name: r.boss_name,
      staff_id: null,
      amount_gross: r.amount_gross,
      amount_cents: r.amount_cents,
      match_status: "historical",
    })),
    mode: dryRun ? "dry-run" : "commit",
  };

  const outDir = join(REPO_ROOT, "data/imports/staff-boss-roma");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const previewPath = join(outDir, `preview-${stamp}.json`);
  writeFileSync(previewPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        preview_path: previewPath,
        summary: {
          collaborators: rows.length,
          grand_total_cents: parsed.grandTotalCents,
          grand_total_euros: centsToEuros(parsed.grandTotalCents),
          staff_id_all_null: true,
          period_confirmed: false,
          mode: report.mode,
        },
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log("Dry-run: nessuna scrittura DB. Rilancia con --commit per importare.");
    return;
  }

  const supabase = createServiceClient();

  const { data: existing, error: exErr } = await supabase
    .from("legacy_staff_turnover")
    .select("*")
    .eq("salon_id", SALON_ID)
    .in("source_batch", [sourceBatch, "boss_lav002_roma_20220101_20261031"]);
  if (exErr) throw new Error(`backup select: ${exErr.message}`);
  const backupPath = join(outDir, `backup-fix-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify(existing ?? [], null, 2));

  // Rimuovi batch legacy con periodo inventato (stesso salone).
  const { error: delErr } = await supabase
    .from("legacy_staff_turnover")
    .delete()
    .eq("salon_id", SALON_ID)
    .eq("source_batch", "boss_lav002_roma_20220101_20261031");
  if (delErr) throw new Error(`delete old batch: ${delErr.message}`);

  const upsertRows = rows.map(({ amount_cents: _c, ...row }) => ({
    ...row,
    updated_at: new Date().toISOString(),
  }));

  const { data: upserted, error: upErr } = await supabase
    .from("legacy_staff_turnover")
    .upsert(upsertRows, { onConflict: "salon_id,source_batch,boss_code" })
    .select("id, boss_code, boss_name, staff_id, amount_gross, match_status, period_confirmed");

  if (upErr) throw new Error(`upsert: ${upErr.message}`);

  const { data: verify, error: vErr } = await supabase
    .from("legacy_staff_turnover")
    .select("boss_code, boss_name, staff_id, amount_gross, match_status, period_from, period_to, period_confirmed")
    .eq("salon_id", SALON_ID)
    .eq("source_batch", sourceBatch);
  if (vErr) throw new Error(`verify: ${vErr.message}`);

  const verifyCents = (verify ?? []).reduce(
    (s, r) => s + Math.round((Number(r.amount_gross) || 0) * 100),
    0,
  );
  const linked = (verify ?? []).filter((r) => r.staff_id != null);

  const resultPath = join(outDir, `import-result-${stamp}.json`);
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        backup_path: backupPath,
        imported: upserted?.length ?? 0,
        verify_count: verify?.length ?? 0,
        verify_cents: verifyCents,
        expected_cents: parsed.grandTotalCents,
        cents_match: verifyCents === parsed.grandTotalCents,
        staff_id_linked: linked.length,
        period_confirmed_any: (verify ?? []).some((r) => r.period_confirmed),
        rows: verify,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        imported: upserted?.length ?? 0,
        verify_cents: verifyCents,
        expected_cents: parsed.grandTotalCents,
        staff_id_linked: linked.length,
        result_path: resultPath,
        backup_path: backupPath,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
