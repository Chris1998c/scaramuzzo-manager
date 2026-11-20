/**
 * Misura lato query (service role) i RPC che alimentano «Incasso reale · oggi».
 * Non include middleware/auth cookie (quello va con ?perf=1 sulla Preview autenticata).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2]!.trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]!]) process.env[m[1]!] = v;
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing Supabase env");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const salonIds = process.argv.slice(2).map(Number).filter((n) => n > 0);
  const targets = salonIds.length ? salonIds : [3, 1];
  const day = todayISO();

  for (const salonId of targets) {
    const t0 = performance.now();
    const turnoverP = (async () => {
      const t = performance.now();
      const totals = await supabase.rpc("report_turnover", {
        p_salon_id: salonId,
        p_from: day,
        p_to: day,
        p_staff_id: null,
        p_payment_method: null,
        p_item_type: null,
      });
      const rows = await supabase.rpc("report_rows", {
        p_salon_id: salonId,
        p_from: day,
        p_to: day,
        p_staff_id: null,
        p_payment_method: null,
        p_item_type: null,
      });
      return {
        ms: Math.round(performance.now() - t),
        totalsErr: totals.error?.message ?? null,
        rowsErr: rows.error?.message ?? null,
        gross: Array.isArray(totals.data) ? totals.data[0]?.gross_total : null,
      };
    })();

    // Fan-out tipico del riepilogo (5 turnover + 2 agenda) in parallelo
    const fanOutP = (async () => {
      const t = performance.now();
      await Promise.all([
        supabase.rpc("report_turnover", {
          p_salon_id: salonId,
          p_from: day,
          p_to: day,
          p_staff_id: null,
          p_payment_method: null,
          p_item_type: null,
        }),
        supabase.rpc("report_rows", {
          p_salon_id: salonId,
          p_from: day,
          p_to: day,
          p_staff_id: null,
          p_payment_method: null,
          p_item_type: null,
        }),
        // proxy: altre 4 coppie sarebbero simili; qui misuriamo solo il costo «oggi»
      ]);
      return Math.round(performance.now() - t);
    })();

    const [today, fanOutMs] = await Promise.all([turnoverP, fanOutP]);
    console.log(
      JSON.stringify({
        salonId,
        day,
        today_turnover_serial_ms: today.ms,
        today_parallel_pair_ms: fanOutMs,
        wall_ms: Math.round(performance.now() - t0),
        gross_total: today.gross,
        errors: { totals: today.totalsErr, rows: today.rowsErr },
        note: "query-only service role; auth_ms solo su Preview con ?perf=1",
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
