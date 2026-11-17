/**
 * Import fatturato collaboratori Boss LAV002 (solo Roma, IVA inclusa).
 * Non crea vendite/scontrini/servizi/appuntamenti. Default dry-run.
 *
 * Usage:
 *   npm run import:boss-staff-turnover:roma -- --dry-run
 *   npm run import:boss-staff-turnover:roma -- --commit --period-from 2022-01-01 --period-to 2026-10-31
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import {
  parseBossLav002Sheet,
  roundMoney2,
  type BossLav002CollaboratorBlock,
} from "../../lib/imports/bossLav002XlsParse.ts";
import {
  indexStaffByCode,
  matchLav002ByStaffCode,
  type Lav002MatchResult,
  type StaffMatchCandidate,
} from "../../lib/imports/bossLav002Match.ts";

const REPO_ROOT = process.cwd();
const DEFAULT_FILE = join(
  REPO_ROOT,
  "data/imports/staff-boss-roma/LAV002-Lavoranti_Dettagli_Servizi_e_Vendita-17-11-2026_17-26.xls",
);
const SALON_ID = 1;
const SALON_NAME = "Roma";

type PreviewRow = {
  boss_name: string;
  boss_code: string;
  amount_gross: number;
  services_gross: number;
  products_gross: number;
  match: Lav002MatchResult;
  importable: boolean;
  exclude_reason: string | null;
};

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

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
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

function buildSourceBatch(periodFrom: string, periodTo: string): string {
  return `boss_lav002_roma_${periodFrom.replace(/-/g, "")}_${periodTo.replace(/-/g, "")}`;
}

async function loadStaff(supabase: SupabaseClient): Promise<StaffMatchCandidate[]> {
  const { data, error } = await supabase.from("staff").select("id, staff_code, name, active");
  if (error) throw new Error(`staff load: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    staff_code: String(r.staff_code ?? ""),
    name: String(r.name ?? ""),
    active: !!r.active,
  }));
}

function toPreviewRows(
  blocks: BossLav002CollaboratorBlock[],
  staffIndex: ReturnType<typeof indexStaffByCode>,
): PreviewRow[] {
  return blocks.map((b) => {
    const match = matchLav002ByStaffCode(b.bossCode, staffIndex);
    if (match.status === "ambiguous") {
      return {
        boss_name: b.bossName,
        boss_code: b.bossCode,
        amount_gross: roundMoney2(b.totalGross),
        services_gross: roundMoney2(b.servicesGross),
        products_gross: roundMoney2(b.productsGross),
        match,
        importable: false,
        exclude_reason: match.reason,
      };
    }
    // unmatched e matched_* sono importabili (unmatched → staff_id null, storico nominativo)
    return {
      boss_name: b.bossName,
      boss_code: b.bossCode,
      amount_gross: roundMoney2(b.totalGross),
      services_gross: roundMoney2(b.servicesGross),
      products_gross: roundMoney2(b.productsGross),
      match,
      importable: true,
      exclude_reason: null,
    };
  });
}

async function reconcileAgainstLegacy(
  supabase: SupabaseClient,
  periodFrom: string,
  periodTo: string,
  attributedGross: number,
) {
  const pageSize = 1000;
  const rows: Array<{ day: string; total_gross: number }> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("legacy_turnover_daily")
      .select("day, total_gross")
      .eq("salon_id", SALON_ID)
      .gte("day", periodFrom)
      .lte("day", periodTo)
      .order("day", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`legacy_turnover_daily: ${error.message}`);
    const batch = data ?? [];
    for (const r of batch) {
      rows.push({ day: String(r.day), total_gross: Number(r.total_gross) || 0 });
    }
    if (batch.length < pageSize) break;
  }

  const byMonth = new Map<string, number>();
  let salonGross = 0;
  for (const r of rows) {
    salonGross += r.total_gross;
    const month = r.day.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + r.total_gross);
  }

  return {
    salon_days: rows.length,
    salon_gross: roundMoney2(salonGross),
    attributed_gross: roundMoney2(attributedGross),
    unattributed_gross: roundMoney2(salonGross - attributedGross),
    monthly_salon: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({
        month,
        salon_gross: roundMoney2(total),
        note: "file LAV002 senza granularità mese — nessun totale mensile collaboratori da confrontare",
      })),
  };
}

async function main() {
  const commit = hasFlag("--commit");
  const dryRun = !commit || hasFlag("--dry-run");
  const filePath = argValue("--file") ?? DEFAULT_FILE;
  const periodFrom = argValue("--period-from");
  const periodTo = argValue("--period-to");

  if (!existsSync(filePath)) {
    console.error(`File mancante: ${filePath}`);
    process.exit(1);
  }
  if (!periodFrom || !periodTo || !/^\d{4}-\d{2}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(periodTo)) {
    console.error(
      "Obbligatori --period-from e --period-to (YYYY-MM-DD). Il file LAV002 non contiene il periodo.",
    );
    process.exit(1);
  }
  if (periodFrom > periodTo) {
    console.error("period-from > period-to");
    process.exit(1);
  }

  const parsed = parseLav002File(filePath);
  const supabase = createServiceClient();
  const staff = await loadStaff(supabase);
  const staffIndex = indexStaffByCode(staff);
  const preview = toPreviewRows(parsed.collaborators, staffIndex);
  const importable = preview.filter((p) => p.importable);
  const excluded = preview.filter((p) => !p.importable);
  const attributed = importable.reduce((s, r) => s + r.amount_gross, 0);
  const reconciliation = await reconcileAgainstLegacy(
    supabase,
    periodFrom,
    periodTo,
    attributed,
  );

  const periodNote =
    "Periodo NON presente nel file LAV002; dichiarato esplicitamente a CLI e usato solo per storicizzare/riconciliare contro legacy_turnover_daily Roma.";
  const sourceBatch = buildSourceBatch(periodFrom, periodTo);
  const sourceFile = filePath.replace(REPO_ROOT + "/", "");

  const report = {
    salon_id: SALON_ID,
    salon: SALON_NAME,
    file: sourceFile,
    sheet: parsed.sheetName,
    rows_in_sheet: parsed.rowCount,
    collaborators: preview.length,
    period_from: periodFrom,
    period_to: periodTo,
    period_note: periodNote,
    period_in_file: false,
    granularity: "period_total_per_collaborator",
    vat: "gross_inc_vat_boss_valore",
    services_imported: false,
    sales_created: false,
    source_batch: sourceBatch,
    parse_warnings: parsed.warnings,
    totals: {
      file_grand_total_gross: roundMoney2(parsed.grandTotalGross),
      importable_gross: roundMoney2(attributed),
      excluded_gross: roundMoney2(excluded.reduce((s, r) => s + r.amount_gross, 0)),
    },
    reconciliation,
    mapping: preview,
    excluded,
    mode: dryRun ? "dry-run" : "commit",
  };

  const outDir = join(REPO_ROOT, "data/imports/staff-boss-roma");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const previewPath = join(outDir, `preview-${stamp}.json`);
  writeFileSync(previewPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ preview_path: previewPath, summary: {
    collaborators: preview.length,
    importable: importable.length,
    excluded: excluded.length,
    file_total: report.totals.file_grand_total_gross,
    salon_legacy_total: reconciliation.salon_gross,
    unattributed: reconciliation.unattributed_gross,
    period_in_file: false,
    mode: report.mode,
  }}, null, 2));

  if (dryRun) {
    console.log("Dry-run: nessuna scrittura DB. Rilancia con --commit per importare.");
    return;
  }

  // Backup existing batch rows
  const { data: existing, error: exErr } = await supabase
    .from("legacy_staff_turnover")
    .select("*")
    .eq("salon_id", SALON_ID)
    .eq("source_batch", sourceBatch);
  if (exErr) throw new Error(`backup select: ${exErr.message}`);
  const backupPath = join(outDir, `backup-${sourceBatch}-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify(existing ?? [], null, 2));

  const upsertRows = importable.map((r) => ({
    salon_id: SALON_ID,
    period_from: periodFrom,
    period_to: periodTo,
    boss_name: r.boss_name,
    boss_code: r.boss_code,
    staff_id: r.match.staffId,
    amount_gross: r.amount_gross,
    services_gross: r.services_gross,
    products_gross: r.products_gross,
    qty_total: 0,
    match_status: r.match.status,
    source_batch: sourceBatch,
    source_file: sourceFile,
    period_note: periodNote,
    updated_at: new Date().toISOString(),
  }));

  // attach qty from blocks
  const byCode = new Map(parsed.collaborators.map((c) => [c.bossCode, c]));
  for (const row of upsertRows) {
    const b = byCode.get(row.boss_code);
    if (b) row.qty_total = roundMoney2(b.totalQty);
  }

  const { data: upserted, error: upErr } = await supabase
    .from("legacy_staff_turnover")
    .upsert(upsertRows, { onConflict: "salon_id,source_batch,boss_code" })
    .select("id, boss_code, boss_name, staff_id, amount_gross, match_status");

  if (upErr) throw new Error(`upsert: ${upErr.message}`);

  const { data: verify, error: vErr } = await supabase
    .from("legacy_staff_turnover")
    .select("amount_gross, match_status, staff_id, boss_code")
    .eq("salon_id", SALON_ID)
    .eq("source_batch", sourceBatch);
  if (vErr) throw new Error(`verify: ${vErr.message}`);

  const verifySum = roundMoney2(
    (verify ?? []).reduce((s, r) => s + (Number(r.amount_gross) || 0), 0),
  );

  const resultPath = join(outDir, `import-result-${stamp}.json`);
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        backup_path: backupPath,
        imported: upserted?.length ?? 0,
        excluded: excluded.length,
        excluded_rows: excluded,
        verify_count: verify?.length ?? 0,
        verify_sum: verifySum,
        expected_sum: roundMoney2(attributed),
        scraps: excluded.map((e) => ({
          boss_code: e.boss_code,
          boss_name: e.boss_name,
          amount_gross: e.amount_gross,
          reason: e.exclude_reason,
        })),
        reconciliation,
        quadratura: false,
        quadratura_note:
          "Nessuna quadratura dichiarata: LAV002 senza mesi/giorni; scarto vs legacy_turnover_daily non ridistribuito.",
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        imported: upserted?.length ?? 0,
        excluded: excluded.length,
        verify_sum: verifySum,
        unattributed: reconciliation.unattributed_gross,
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
