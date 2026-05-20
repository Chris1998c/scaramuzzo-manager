/**
 * Smoke operativo Roma (salon_id=1) via API Next + verifica DB.
 *
 * Prerequisiti:
 *   - .env.local con Supabase + SMOKE_RECEPTION_PASSWORD
 *   - Dev server: npm run dev  (BASE_URL default http://localhost:3000)
 *
 * Usage:
 *   SMOKE_RECEPTION_PASSWORD='***' node --experimental-strip-types scripts/smoke-roma-operational-session.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const SALON_ID = 1;
const PREFIX = "SMOKE_ROMA_";
const SLOT_MINUTES = 15;

type StepResult = {
  step: string;
  status: "PASS" | "FAIL" | "SKIP";
  httpStatus?: number;
  detail?: string;
};

const results: StepResult[] = [];
const artifacts: Record<string, string | number | null> = {};

function log(step: string, status: StepResult["status"], detail?: string, httpStatus?: number) {
  results.push({ step, status, detail, httpStatus });
  const tag = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "○";
  console.log(`${tag} ${step} [${status}]${httpStatus != null ? ` HTTP ${httpStatus}` : ""}${detail ? ` — ${detail}` : ""}`);
}

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function snapToSlot(d: Date): Date {
  const x = new Date(d);
  const m = x.getMinutes();
  const snapped = Math.round(m / SLOT_MINUTES) * SLOT_MINUTES;
  x.setMinutes(snapped, 0, 0);
  return x;
}

function toNoZ(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function romeTomorrowAt(hour: number, minute = 0): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value ?? 2026);
  const m = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const d = Number(parts.find((p) => p.type === "day")?.value ?? 1);
  const base = new Date(y, m - 1, d + 1, hour, minute, 0, 0);
  return toNoZ(snapToSlot(base));
}

function cookieHeaderFromStore(store: { name: string; value: string }[]): string {
  return store.map((c) => `${c.name}=${c.value}`).join("; ");
}

function coerceDbId(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "bigint") return Number(v);
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

async function apiJson(
  baseUrl: string,
  cookieStore: { name: string; value: string }[],
  path: string,
  init?: RequestInit,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeaderFromStore(cookieStore),
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function ensureSmokeCustomer(admin: SupabaseClient): Promise<string> {
  const phone = "+390000SMOKE01";
  const testEmail = "smoke.roma@test.local";

  const { data: byPhone } = await admin
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (byPhone?.id) return String(byPhone.id);

  const { data: byEmail } = await admin
    .from("customers")
    .select("id")
    .eq("email", testEmail)
    .maybeSingle();
  if (byEmail?.id) return String(byEmail.id);

  const { data: ins, error } = await admin
    .from("customers")
    .insert({
      first_name: "SMOKE_ROMA",
      last_name: "CLIENT",
      phone,
      email: testEmail,
      notes: `${PREFIX}smoke test — safe to delete`,
    })
    .select("id")
    .single();
  if (error || !ins) throw new Error(error?.message ?? "insert customer failed");
  return String((ins as { id: unknown }).id);
}

async function main() {
  loadEnvLocal();

  const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const email = (process.env.SMOKE_RECEPTION_EMAIL ?? "romascaramuzzo@gmail.com").trim();
  const password = process.env.SMOKE_RECEPTION_PASSWORD?.trim();

  if (!url || !anon || !serviceKey) {
    console.error("Mancano variabili Supabase in .env.local");
    process.exit(1);
  }
  if (!password) {
    console.error("Manca SMOKE_RECEPTION_PASSWORD (non verrà loggata).");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cookieJar: { name: string; value: string }[] = [];
  const authClient = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieJar;
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const c of cookiesToSet) {
          const idx = cookieJar.findIndex((x) => x.name === c.name);
          if (idx >= 0) cookieJar[idx] = { name: c.name, value: c.value };
          else cookieJar.push({ name: c.name, value: c.value });
        }
      },
    },
  });

  console.log(`\n=== ${PREFIX}operational session — salon ${SALON_ID} ===\n`);
  console.log(`BASE_URL=${baseUrl}\n`);

  // --- 0. Server up? ---
  try {
    const ping = await fetch(`${baseUrl}/login`, { method: "GET" });
    log("0.server", ping.ok ? "PASS" : "FAIL", `GET /login → ${ping.status}`, ping.status);
  } catch (e) {
    log("0.server", "FAIL", `Server non raggiungibile: ${e}`);
    console.error("\nAvvia: npm run dev\n");
    process.exit(1);
  }

  // --- 1. AUTH ---
  const { data: signIn, error: signErr } = await authClient.auth.signInWithPassword({ email, password });
  if (signErr || !signIn.session) {
    log("1.auth", "FAIL", signErr?.message ?? "no session");
    process.exit(1);
  }
  log("1.auth", "PASS", `signed in ${email}`);

  const me = await apiJson(baseUrl, cookieJar, "/api/auth/me");
  const meUser = me.json.user as { email?: string } | null;
  if (me.status === 200 && meUser?.email) {
    log("1.session.cookie", "PASS", `cookie SSR ok (${meUser.email})`);
  } else {
    log(
      "1.session.cookie",
      "FAIL",
      `API non vede sessione (HTTP ${me.status}). Le route Next usano cookie @supabase/ssr — verifica dev server.`,
      me.status,
    );
  }

  // --- 2. PRECHECK DB ---
  const { data: urow } = await admin
    .from("users")
    .select("id, role_id")
    .ilike("email", email)
    .maybeSingle();
  if (!urow || urow.role_id !== 2) {
    log("2.precheck.user", "FAIL", "reception user missing");
  } else {
    const { data: us } = await admin.from("user_salons").select("salon_id").eq("user_id", urow.id);
    const salons = (us ?? []).map((r) => Number((r as { salon_id: unknown }).salon_id));
    log(
      "2.precheck.user",
      salons.includes(SALON_ID) ? "PASS" : "FAIL",
      `user_salons=${salons.join(",")}`,
    );
  }

  const { data: staffRows } = await admin
    .from("staff")
    .select("id, name, active")
    .eq("active", true);
  const { data: ssLinks } = await admin.from("staff_salons").select("staff_id").eq("salon_id", SALON_ID);
  const linked = new Set((ssLinks ?? []).map((r) => Number((r as { staff_id: unknown }).staff_id)));
  const staffForSalon = (staffRows ?? []).filter((s) => linked.has(Number((s as { id: unknown }).id)));
  if (!staffForSalon.length) {
    log("2.precheck.staff", "FAIL", "no staff for salon 1");
    process.exit(1);
  }
  const staffId = Number((staffForSalon[0] as { id: unknown }).id);
  artifacts.staff_id = staffId;
  log("2.precheck.staff", "PASS", `staff_id=${staffId} name=${(staffForSalon[0] as { name?: string }).name}`);

  const { data: priceRow } = await admin
    .from("service_prices")
    .select("service_id, price, services!inner(id, name, duration, visible_in_agenda, active, visible_in_cash)")
    .eq("salon_id", SALON_ID)
    .eq("services.visible_in_agenda", true)
    .eq("services.active", true)
    .limit(1)
    .maybeSingle();
  if (!priceRow) {
    log("2.precheck.service", "FAIL", "no agenda service with price");
    process.exit(1);
  }
  const serviceId = Number((priceRow as { service_id: unknown }).service_id);
  artifacts.service_id = serviceId;
  log("2.precheck.service", "PASS", `service_id=${serviceId}`);

  let customerId: string;
  try {
    customerId = await ensureSmokeCustomer(admin);
    artifacts.customer_id = customerId;
    log("2.precheck.customer", "PASS", `customer_id=${customerId}`);
  } catch (e) {
    log("2.precheck.customer", "FAIL", String(e));
    process.exit(1);
  }

  const slotT1 = romeTomorrowAt(11, 0);
  const slotT2 = romeTomorrowAt(14, 0);
  const slotT3 = romeTomorrowAt(11, 0);

  // --- 3. AGENDA CREATE ---
  const createBody = {
    salon_id: SALON_ID,
    customer_id: customerId,
    start_time: slotT1,
    notes: `${PREFIX}appointment_main`,
    services: [{ service_id: serviceId, staff_id: staffId }],
  };
  const create1 = await apiJson(baseUrl, cookieJar, "/api/agenda/appointments", {
    method: "POST",
    body: JSON.stringify(createBody),
  });
  const apptId = Number(create1.json.appointment_id);
  if (create1.status >= 200 && create1.status < 300 && apptId > 0) {
    artifacts.appointment_id = apptId;
    log("3.agenda.create", "PASS", `appointment_id=${apptId}`, create1.status);
  } else {
    log("3.agenda.create", "FAIL", JSON.stringify(create1.json), create1.status);
    process.exit(1);
  }

  const { data: apptRow } = await admin
    .from("appointments")
    .select("id, salon_id, staff_id, status")
    .eq("id", apptId)
    .single();
  const { data: lineRows } = await admin
    .from("appointment_services")
    .select("id, staff_id, start_time, duration_minutes")
    .eq("appointment_id", apptId);
  const lineOk =
    apptRow?.salon_id === SALON_ID &&
    (lineRows?.length ?? 0) > 0 &&
    Number((lineRows![0] as { staff_id: unknown }).staff_id) === staffId;
  log(
    "3.agenda.db",
    lineOk ? "PASS" : "FAIL",
    `lines=${lineRows?.length ?? 0} salon=${apptRow?.salon_id}`,
  );
  const lineId = Number((lineRows![0] as { id: unknown }).id);
  artifacts.line_id = lineId;

  // --- 4. OVERLAP ---
  const createDup = await apiJson(baseUrl, cookieJar, "/api/agenda/appointments", {
    method: "POST",
    body: JSON.stringify(createBody),
  });
  const dupErr = String(createDup.json.error ?? "");
  if (createDup.status === 409 && dupErr.includes("Collaboratore già impegnato")) {
    log("4.overlap.create", "PASS", dupErr, 409);
  } else {
    log("4.overlap.create", "FAIL", `${createDup.status} ${JSON.stringify(createDup.json)}`, createDup.status);
  }

  // --- 5. DRAG / MOVE ---
  const moveFree = await apiJson(baseUrl, cookieJar, `/api/agenda/lines/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify({ start_time: slotT2 }),
  });
  if (moveFree.status >= 200 && moveFree.status < 300) {
    const { data: moved } = await admin
      .from("appointment_services")
      .select("start_time")
      .eq("id", lineId)
      .single();
    const movedStart = String((moved as { start_time?: string })?.start_time ?? "");
    log("5.drag.free", "PASS", `start_time=${movedStart}`, moveFree.status);
  } else {
    log("5.drag.free", "FAIL", JSON.stringify(moveFree.json), moveFree.status);
  }

  const apptBlock = await apiJson(baseUrl, cookieJar, "/api/agenda/appointments", {
    method: "POST",
    body: JSON.stringify({
      ...createBody,
      start_time: slotT3,
      notes: `${PREFIX}appointment_blocker`,
    }),
  });
  const blockerId = Number(apptBlock.json.appointment_id);
  if (blockerId > 0) artifacts.appointment_blocker_id = blockerId;

  const moveConflict = await apiJson(baseUrl, cookieJar, `/api/agenda/lines/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify({ start_time: slotT3 }),
  });
  const conflictErr = String(moveConflict.json.error ?? "");
  if (moveConflict.status === 409 && conflictErr.includes("Collaboratore già impegnato")) {
    log("5.drag.conflict", "PASS", conflictErr, 409);
  } else {
    log(
      "5.drag.conflict",
      moveConflict.status === 409 ? "FAIL" : "FAIL",
      `${moveConflict.status} ${JSON.stringify(moveConflict.json)}`,
      moveConflict.status,
    );
  }

  // --- 6. WALK-IN ---
  const walkIn = await apiJson(baseUrl, cookieJar, "/api/agenda/walk-ins", {
    method: "POST",
    body: JSON.stringify({
      customer_id: customerId,
      salon_id: SALON_ID,
      staff_id: staffId,
      service_ids: [serviceId],
      notes: `${PREFIX}walk_in`,
    }),
  });
  const walkId = Number(walkIn.json.appointment_id);
  if (walkIn.status >= 200 && walkIn.status < 300 && walkId > 0) {
    artifacts.walk_in_appointment_id = walkId;
    const { data: wAppt } = await admin.from("appointments").select("status, salon_id").eq("id", walkId).single();
    const { count: wLines } = await admin
      .from("appointment_services")
      .select("id", { count: "exact", head: true })
      .eq("appointment_id", walkId);
    log(
      "6.walkin",
      wAppt?.status === "in_sala" && wAppt?.salon_id === SALON_ID && (wLines ?? 0) > 0 ? "PASS" : "FAIL",
      `status=${wAppt?.status} lines=${wLines}`,
      walkIn.status,
    );
  } else {
    log("6.walkin", "FAIL", JSON.stringify(walkIn.json), walkIn.status);
  }

  // --- 7. PORTA IN SALA ---
  const portaAppt = await apiJson(baseUrl, cookieJar, "/api/agenda/appointments", {
    method: "POST",
    body: JSON.stringify({
      salon_id: SALON_ID,
      customer_id: customerId,
      start_time: romeTomorrowAt(16, 0),
      notes: `${PREFIX}porta_in_sala`,
      services: [{ service_id: serviceId, staff_id: staffId }],
    }),
  });
  const portaId = Number(portaAppt.json.appointment_id);
  if (portaId > 0) {
    artifacts.porta_appointment_id = portaId;
    const porta = await apiJson(baseUrl, cookieJar, "/api/agenda/porta-in-sala", {
      method: "POST",
      body: JSON.stringify({ appointment_id: portaId }),
    });
    const { data: pAppt } = await admin.from("appointments").select("status").eq("id", portaId).single();
    log(
      "7.porta_in_sala",
      porta.status >= 200 && porta.status < 300 && pAppt?.status === "in_sala" ? "PASS" : "FAIL",
      `api=${porta.status} status=${pAppt?.status}`,
      porta.status,
    );
  } else {
    log("7.porta_in_sala", "FAIL", JSON.stringify(portaAppt.json), portaAppt.status);
  }

  // --- 8. CASSA ---
  const { data: openSess } = await admin
    .from("cash_sessions")
    .select("id")
    .eq("salon_id", SALON_ID)
    .is("closed_at", null)
    .maybeSingle();

  let cashSessionId = openSess?.id != null ? Number(openSess.id) : null;
  if (!cashSessionId) {
    const openRes = await apiJson(baseUrl, cookieJar, "/api/cassa/open", {
      method: "POST",
      body: JSON.stringify({ salon_id: SALON_ID, opening_float: 0, printer_enabled: false }),
    });
    const sess = openRes.json.session as { id?: unknown } | undefined;
    cashSessionId = Number(sess?.id ?? openRes.json.session_id ?? 0) || null;
    if (openRes.status >= 200 && openRes.status < 300 && cashSessionId) {
      artifacts.cash_session_id = cashSessionId;
      log("8.cassa.open", "PASS", `session_id=${cashSessionId}`, openRes.status);
    } else {
      log("8.cassa.open", "FAIL", JSON.stringify(openRes.json), openRes.status);
    }
  } else {
    artifacts.cash_session_id = cashSessionId;
    log("8.cassa.open", "PASS", `already open id=${cashSessionId}`);
  }

  const closeTarget = walkId > 0 ? walkId : portaId;
  if (closeTarget > 0 && cashSessionId) {
    const closeRes = await apiJson(baseUrl, cookieJar, "/api/cassa/close", {
      method: "POST",
      body: JSON.stringify({
        appointment_id: closeTarget,
        payment_method: "cash",
        lines: [{ kind: "service", id: serviceId, qty: 1 }],
      }),
    });
    const saleId = coerceDbId(closeRes.json.sale_id);
    if (closeRes.status >= 200 && closeRes.status < 300 && saleId != null) {
      artifacts.sale_id = saleId;
      artifacts.fiscal_print_job_id = coerceDbId(closeRes.json.fiscal_print_job_id);

      const { data: sale, error: saleErr } = await admin
        .from("sales")
        .select("id, salon_id")
        .eq("id", saleId)
        .maybeSingle();
      const { count: itemCount, error: itemsErr } = await admin
        .from("sale_items")
        .select("id", { count: "exact", head: true })
        .eq("sale_id", saleId);
      const { data: apptAfter, error: apptErr } = await admin
        .from("appointments")
        .select("id, sale_id, status")
        .eq("id", closeTarget)
        .maybeSingle();
      const { data: fiscal, error: fiscalErr } = await admin
        .from("fiscal_print_jobs")
        .select("id, status, sale_id")
        .eq("sale_id", saleId)
        .maybeSingle();

      const fiscalJobId = coerceDbId(fiscal?.id);
      if (fiscalJobId) artifacts.fiscal_print_job_id = fiscalJobId;

      const saleSalonId = Number((sale as { salon_id?: unknown } | null)?.salon_id);
      const apptSaleId = coerceDbId((apptAfter as { sale_id?: unknown } | null)?.sale_id);
      const apptStatus = String((apptAfter as { status?: unknown } | null)?.status ?? "");

      const saleOk = !saleErr && sale != null && coerceDbId((sale as { id?: unknown }).id) === saleId;
      const salonOk = saleSalonId === SALON_ID;
      const itemsOk = !itemsErr && (itemCount ?? 0) > 0;
      const apptOk =
        !apptErr &&
        apptAfter != null &&
        apptSaleId === saleId;
      const fiscalOk = !fiscalErr && (fiscal == null || coerceDbId(fiscal.sale_id) === saleId);

      log(
        "8.cassa.close",
        saleOk && salonOk && itemsOk && apptOk ? "PASS" : "FAIL",
        [
          `sale_id=${saleId}`,
          `sale_salon=${saleSalonId}`,
          `items=${itemCount ?? 0}`,
          `appt_sale_id=${apptSaleId ?? "null"}`,
          `appt_status=${apptStatus || "n/a"}`,
          `fiscal_job=${fiscalJobId ?? "n/a"}`,
          fiscal?.status ? `fiscal_status=${fiscal.status}` : "",
          saleErr ? `saleErr=${saleErr.message}` : "",
          apptErr ? `apptErr=${apptErr.message}` : "",
        ]
          .filter(Boolean)
          .join(" "),
        closeRes.status,
      );
    } else {
      log("8.cassa.close", "FAIL", JSON.stringify(closeRes.json), closeRes.status);
    }
  } else {
    log("8.cassa.close", "SKIP", "no walk-in/porta appointment or cash session");
  }

  // --- 9. MAGAZZINO (read-only) ---
  const { data: ps } = await admin
    .from("product_stock")
    .select("product_id, quantity")
    .eq("salon_id", SALON_ID)
    .gt("quantity", 0)
    .limit(1)
    .maybeSingle();
  const { data: sm } = await admin
    .from("stock_movements")
    .select("id, sale_id, transfer_id, created_by, to_salon, from_salon")
    .or(`to_salon.eq.${SALON_ID},from_salon.eq.${SALON_ID}`)
    .order("id", { ascending: false })
    .limit(5);
  log(
    "9.magazzino.readonly",
    "PASS",
    `product_stock sample=${ps?.product_id ?? "none"} movements=${sm?.length ?? 0}`,
  );

  // --- 10. REPORT ---
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const cassaReport = await apiJson(
    baseUrl,
    cookieJar,
    `/api/cassa/report?salon_id=${SALON_ID}&date=${today}`,
    { method: "GET" },
  );
  log(
    "10.report.cassa",
    cassaReport.status >= 200 && cassaReport.status < 300 ? "PASS" : "FAIL",
    `HTTP ${cassaReport.status}`,
    cassaReport.status,
  );

  log(
    "10.report.turnover_rpc",
    "SKIP",
    "RPC report_turnover richiede JWT/RLS utente (non service role); coperto da GET /api/cassa/report con cookie SSR",
  );

  // --- SUMMARY ---
  const fail = results.filter((r) => r.status === "FAIL").length;
  const pass = results.filter((r) => r.status === "PASS").length;
  const skip = results.filter((r) => r.status === "SKIP").length;

  console.log("\n--- ARTIFACTS (cleanup manuale) ---");
  for (const [k, v] of Object.entries(artifacts)) {
    console.log(`  ${k}: ${v}`);
  }

  console.log("\n--- SQL cleanup suggerito (NON eseguito) ---");
  if (artifacts.appointment_id) {
    console.log(
      `-- DELETE appointment_services / appointments WHERE notes LIKE '${PREFIX}%';`,
    );
    console.log(`-- DELETE FROM appointment_services WHERE appointment_id IN (${[artifacts.appointment_id, artifacts.appointment_blocker_id, artifacts.walk_in_appointment_id, artifacts.porta_appointment_id].filter(Boolean).join(", ")});`);
    console.log(`-- DELETE FROM appointments WHERE id IN (${[artifacts.appointment_id, artifacts.appointment_blocker_id, artifacts.walk_in_appointment_id, artifacts.porta_appointment_id].filter(Boolean).join(", ")});`);
  }
  if (artifacts.sale_id) {
    console.log(`-- Verificare sale_id=${artifacts.sale_id} prima di cancellare (ledger/stock).`);
  }
  console.log(
    `-- Cliente test: id=${artifacts.customer_id} phone=+390000SMOKE01 email=smoke.roma@test.local`,
  );

  console.log(`\n--- Riepilogo: PASS=${pass} FAIL=${fail} SKIP=${skip} ---`);
  console.log(
    `\nROMA OPERATIONAL SIMULATION: ${fail === 0 ? "GO" : "NO GO"}\n`,
  );

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
