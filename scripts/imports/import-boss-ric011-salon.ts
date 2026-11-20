/**
 * Import RIC011 → public.legacy_turnover_daily per sede.
 * Solo totali giornalieri IVA inclusa. Default dry-run.
 *
 *   npm run import:boss-ric011:cosenza -- --dry-run
 *   npm run import:boss-ric011:corigliano -- --commit
 *   node --experimental-strip-types scripts/imports/import-boss-ric011-salon.ts \
 *     --salon-id 2 --salon-code 2 --slug corigliano --file path.pdf
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  centsToEuros,
  parseBossRic011PdfText,
  type BossRic011DayRow,
} from "../../lib/imports/bossRic011PdfParse.ts";

const REPO_ROOT = process.cwd();

const PRESETS: Record<
  string,
  { salonId: number; salonCode: number; slug: string; defaultFile: string }
> = {
  cosenza: {
    salonId: 4,
    salonCode: 4,
    slug: "cosenza",
    defaultFile: "data/imports/turnover-boss-cosenza/RIC011-Cosenza.pdf",
  },
  corigliano: {
    salonId: 2,
    salonCode: 2,
    slug: "corigliano",
    defaultFile: "data/imports/turnover-boss-corigliano/RIC011-Corigliano.pdf",
  },
  castrovillari: {
    salonId: 3,
    salonCode: 3,
    slug: "castrovillari",
    defaultFile: "data/imports/turnover-boss-castrovillari/RIC011-Castrovillari.pdf",
  },
};

function loadEnvLocal() {
  const envPath = join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]!.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]!]) process.env[m[1]!] = val;
  }
}

function hasFlag(f: string) {
  return process.argv.includes(f);
}
function argValue(f: string) {
  const i = process.argv.indexOf(f);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function createServiceClient(): SupabaseClient {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function extractPdfText(pdfPath: string): string {
  return execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function resolveConfig() {
  const presetName = argValue("--preset");
  if (presetName && PRESETS[presetName]) {
    const p = PRESETS[presetName]!;
    return {
      salonId: p.salonId,
      salonCode: p.salonCode,
      slug: p.slug,
      pdfPath: argValue("--file") ?? join(REPO_ROOT, p.defaultFile),
      outDir: join(REPO_ROOT, `data/imports/turnover-boss-${p.slug}`),
    };
  }
  const salonId = Number(argValue("--salon-id"));
  const salonCode = Number(argValue("--salon-code") ?? argValue("--salon-id"));
  const slug = argValue("--slug") ?? `salon-${salonId}`;
  const file = argValue("--file");
  if (!Number.isFinite(salonId) || salonId <= 0 || !file) {
    throw new Error(
      "Usa --preset cosenza|corigliano|castrovillari oppure --salon-id N --file path.pdf",
    );
  }
  return {
    salonId,
    salonCode,
    slug,
    pdfPath: file.startsWith("/") ? file : join(REPO_ROOT, file),
    outDir: join(REPO_ROOT, `data/imports/turnover-boss-${slug}`),
  };
}

async function loadExisting(supabase: SupabaseClient, salonId: number) {
  const map = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("legacy_turnover_daily")
      .select("day, total_gross")
      .eq("salon_id", salonId)
      .order("day")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const r of page) {
      map.set(String(r.day), Math.round(Number(r.total_gross) * 100));
    }
    if (page.length < 1000) break;
  }
  return map;
}

function sqlMoney(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

function buildUpsertSql(
  salonId: number,
  days: BossRic011DayRow[],
  sourceBatch: string,
): string {
  const values = days.map((d) => {
    const f = d.folded;
    return `(${salonId}, '${d.day}'::date, ${sqlMoney(f.viacard_cents)}, ${sqlMoney(f.prod_salone_cents)}, ${sqlMoney(f.serv_altro_cents)}, ${sqlMoney(f.serv_estetica_cents)}, ${sqlMoney(f.serv_salone_cents)}, ${sqlMoney(f.total_cents)}, '${sourceBatch}')`;
  });
  const chunks: string[] = [];
  const size = 150;
  for (let i = 0; i < values.length; i += size) {
    const slice = values.slice(i, i + size);
    chunks.push(`INSERT INTO public.legacy_turnover_daily
  (salon_id, day, viacard, prod_salone, serv_altro, serv_estetica, serv_salone, total_gross, source_batch)
VALUES
  ${slice.join(",\n  ")}
ON CONFLICT (salon_id, day) DO UPDATE SET
  viacard = EXCLUDED.viacard,
  prod_salone = EXCLUDED.prod_salone,
  serv_altro = EXCLUDED.serv_altro,
  serv_estetica = EXCLUDED.serv_estetica,
  serv_salone = EXCLUDED.serv_salone,
  total_gross = EXCLUDED.total_gross,
  source_batch = EXCLUDED.source_batch
WHERE public.legacy_turnover_daily.total_gross IS DISTINCT FROM EXCLUDED.total_gross
   OR public.legacy_turnover_daily.viacard IS DISTINCT FROM EXCLUDED.viacard
   OR public.legacy_turnover_daily.prod_salone IS DISTINCT FROM EXCLUDED.prod_salone
   OR public.legacy_turnover_daily.serv_altro IS DISTINCT FROM EXCLUDED.serv_altro
   OR public.legacy_turnover_daily.serv_estetica IS DISTINCT FROM EXCLUDED.serv_estetica
   OR public.legacy_turnover_daily.serv_salone IS DISTINCT FROM EXCLUDED.serv_salone
   OR public.legacy_turnover_daily.source_batch IS DISTINCT FROM EXCLUDED.source_batch;`);
  }
  return chunks.join("\n\n");
}

async function main() {
  const commit = hasFlag("--commit");
  const dryRun = !commit || hasFlag("--dry-run");
  const force = hasFlag("--force");
  const cfg = resolveConfig();

  if (!existsSync(cfg.pdfPath)) {
    console.error(`PDF mancante: ${cfg.pdfPath}`);
    process.exit(1);
  }

  mkdirSync(cfg.outDir, { recursive: true });
  const text = extractPdfText(cfg.pdfPath);
  writeFileSync(join(cfg.outDir, `RIC011-${cfg.slug}.pdftotext.txt`), text);

  const parsed = parseBossRic011PdfText(text);
  if (parsed.salonCode !== cfg.salonCode) {
    console.error(`Sede PDF ambigua: code=${parsed.salonCode} label=${parsed.salonLabel} (atteso ${cfg.salonCode})`);
    process.exit(1);
  }
  if (!parsed.days.length) {
    console.error("Nessuna riga giornaliera estratta.");
    process.exit(1);
  }
  const extractedCents = parsed.days.reduce((s, d) => s + d.total_cents, 0);
  if (parsed.controlTotalCents != null && parsed.controlTotalCents !== extractedCents) {
    console.error("Scarto totale PDF vs estratto — stop.", {
      control: parsed.controlTotalCents,
      extracted: extractedCents,
    });
    process.exit(1);
  }
  if (parsed.warnings.length) console.warn("warnings:", parsed.warnings);

  const sourceBatch = `boss_ric011_${cfg.slug}_${(parsed.periodFrom ?? "x").replace(/-/g, "")}_${(parsed.periodTo ?? "y").replace(/-/g, "")}`;
  const supabase = createServiceClient();
  const existing = await loadExisting(supabase, cfg.salonId);

  const conflicts: Array<{ day: string; db_cents: number; pdf_cents: number }> = [];
  let identical = 0;
  let missing = 0;
  for (const d of parsed.days) {
    const db = existing.get(d.day);
    if (db == null) missing += 1;
    else if (db === d.total_cents) identical += 1;
    else conflicts.push({ day: d.day, db_cents: db, pdf_cents: d.total_cents });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const report = {
    mode: dryRun ? "dry-run" : "commit",
    salon_id: cfg.salonId,
    salon_label: parsed.salonLabel,
    salon_code: parsed.salonCode,
    column_layout: parsed.columnLayout,
    period_from: parsed.periodFrom,
    period_to: parsed.periodTo,
    first_day: parsed.days[0]?.day ?? null,
    last_day: parsed.days[parsed.days.length - 1]?.day ?? null,
    days: parsed.days.length,
    pdf_control_cents: parsed.controlTotalCents,
    pdf_control_euros: parsed.controlTotalCents != null ? centsToEuros(parsed.controlTotalCents) : null,
    extracted_cents: extractedCents,
    extracted_euros: centsToEuros(extractedCents),
    existing_rows: existing.size,
    identical,
    missing,
    conflicts,
    source_batch: sourceBatch,
    pdf: cfg.pdfPath.replace(REPO_ROOT + "/", ""),
  };
  writeFileSync(join(cfg.outDir, `preview-${stamp}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary: report }, null, 2));

  if (conflicts.length && !force) {
    console.error(
      `Conflitti ${conflicts.length}: importo DB ≠ PDF. Stop senza scrivere. Usa --force solo dopo revisione.`,
    );
    process.exit(2);
  }

  const toInsert = parsed.days.filter((d) => !existing.has(d.day));
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          would_insert: toInsert.length,
          would_skip_identical: identical,
          would_conflict: conflicts.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (toInsert.length === 0 && identical === parsed.days.length) {
    console.log(
      JSON.stringify(
        { imported: false, reason: "zero_insert_zero_change", identical, missing: 0, conflicts: 0 },
        null,
        2,
      ),
    );
    return;
  }

  // Solo righe mancanti (identiche già skippate; conflitti bloccati sopra).
  const sql = buildUpsertSql(cfg.salonId, toInsert.length ? toInsert : parsed.days, sourceBatch);
  const sqlPath = join(cfg.outDir, `upsert-${stamp}.sql`);
  writeFileSync(sqlPath, sql);

  execFileSync("supabase", ["db", "query", "--remote", "--yes", "-f", sqlPath], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });

  const after = await loadExisting(supabase, cfg.salonId);
  let afterCents = 0;
  for (const d of parsed.days) {
    const c = after.get(d.day);
    if (c == null) throw new Error(`Manca dopo import: ${d.day}`);
    if (c !== d.total_cents) throw new Error(`Mismatch dopo import ${d.day}: ${c} vs ${d.total_cents}`);
    afterCents += c;
  }

  const verify = {
    inserted: toInsert.length,
    skipped_identical: identical,
    db_days: parsed.days.length,
    db_cents: afterCents,
    db_euros: centsToEuros(afterCents),
    pdf_cents: extractedCents,
    scrap_cents: afterCents - extractedCents,
    sql_path: sqlPath,
  };
  writeFileSync(join(cfg.outDir, `verify-${stamp}.json`), JSON.stringify(verify, null, 2));
  console.log(JSON.stringify({ imported: true, verify }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
