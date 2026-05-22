/**
 * Smoke P0 overlap agenda Roma (salon_id=1) — create duplicato + drag su slot occupato.
 *
 * Prerequisiti: .env.local (Supabase), dev server su BASE_URL.
 * Auth: SMOKE_RECEPTION_PASSWORD oppure magic link admin per SMOKE_RECEPTION_EMAIL.
 *
 * Usage:
 *   node --experimental-strip-types scripts/smoke-roma-agenda-overlap.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const SALON_ID = 1;
const PREFIX = "SMOKE_ROMA_OVERLAP_";
const SLOT_MINUTES = 15;
const CONFLICT_MSG = "Collaboratore già impegnato in questa fascia oraria";

type StepResult = { step: string; status: "PASS" | "FAIL"; detail?: string; httpStatus?: number };
const results: StepResult[] = [];
const artifacts: Record<string, string | number | null> = {};

function log(step: string, status: StepResult["status"], detail?: string, httpStatus?: number) {
  results.push({ step, status, detail, httpStatus });
  const tag = status === "PASS" ? "✓" : "✗";
  console.log(`${tag} ${step}${httpStatus != null ? ` HTTP ${httpStatus}` : ""}${detail ? ` — ${detail}` : ""}`);
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
  x.setMinutes(Math.round(m / SLOT_MINUTES) * SLOT_MINUTES, 0, 0);
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
  return toNoZ(snapToSlot(new Date(y, m - 1, d + 1, hour, minute, 0, 0)));
}

function cookieHeaderFromStore(store: { name: string; value: string }[]): string {
  return store.map((c) => `${c.name}=${c.value}`).join("; ");
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
  const { data: byPhone } = await admin.from("customers").select("id").eq("phone", phone).maybeSingle();
  if (byPhone?.id) return String(byPhone.id);
  const { data: byEmail } = await admin.from("customers").select("id").eq("email", testEmail).maybeSingle();
  if (byEmail?.id) return String(byEmail.id);
  const { data: anyRow, error } = await admin.from("customers").select("id").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (anyRow?.id) return String(anyRow.id);
  throw new Error("Nessun cliente in DB per smoke");
}

async function signInReception(
  url: string,
  anon: string,
  serviceKey: string,
  email: string,
  password: string | undefined,
  cookieJar: { name: string; value: string }[],
): Promise<void> {
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

  if (password) {
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? "signInWithPassword failed");
    return;
  }

  const adminAuth = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const gen = await adminAuth.auth.admin.generateLink({ type: "magiclink", email });
  if (gen.error || !gen.data?.properties?.hashed_token) {
    throw new Error(gen.error?.message ?? "admin.generateLink failed — imposta SMOKE_RECEPTION_PASSWORD");
  }
  const verify = await authClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: gen.data.properties.hashed_token,
  });
  if (verify.error || !verify.data.session) {
    throw new Error(verify.error?.message ?? "verifyOtp magiclink failed");
  }
}

async function cleanupSmokeAppointments(admin: SupabaseClient) {
  const { data: appts } = await admin
    .from("appointments")
    .select("id")
    .eq("salon_id", SALON_ID)
    .like("notes", `${PREFIX}%`);
  const ids = (appts ?? []).map((r) => Number((r as { id: unknown }).id)).filter((id) => id > 0);
  if (!ids.length) return;
  await admin.from("appointment_services").delete().in("appointment_id", ids);
  await admin.from("appointments").delete().in("id", ids);
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

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cookieJar: { name: string; value: string }[] = [];

  console.log(`\n=== ${PREFIX}agenda overlap — salon ${SALON_ID} ===\n`);
  console.log(`BASE_URL=${baseUrl}\n`);

  try {
    const ping = await fetch(`${baseUrl}/login`, { method: "GET" });
    log("0.server", ping.ok ? "PASS" : "FAIL", `GET /login → ${ping.status}`, ping.status);
    if (!ping.ok) process.exit(1);
  } catch (e) {
    log("0.server", "FAIL", `Server non raggiungibile: ${e}`);
    console.error("\nAvvia: npm run dev\n");
    process.exit(1);
  }

  try {
    await signInReception(url, anon, serviceKey, email, password, cookieJar);
    log("1.auth", "PASS", password ? `password (${email})` : `magiclink admin (${email})`);
  } catch (e) {
    log("1.auth", "FAIL", String(e));
    process.exit(1);
  }

  const me = await apiJson(baseUrl, cookieJar, "/api/auth/me");
  if (me.status !== 200) {
    log("1.session", "FAIL", `HTTP ${me.status}`, me.status);
    process.exit(1);
  }
  log("1.session", "PASS", "cookie SSR ok");

  await cleanupSmokeAppointments(admin);

  const { data: staffRows } = await admin.from("staff").select("id, name, active").eq("active", true);
  const { data: ssLinks } = await admin.from("staff_salons").select("staff_id").eq("salon_id", SALON_ID);
  const linked = new Set((ssLinks ?? []).map((r) => Number((r as { staff_id: unknown }).staff_id)));
  const staffForSalon = (staffRows ?? []).filter((s) => linked.has(Number((s as { id: unknown }).id)));
  if (!staffForSalon.length) {
    log("2.staff", "FAIL", "no staff for salon 1");
    process.exit(1);
  }
  const staffId = Number((staffForSalon[0] as { id: unknown }).id);

  const { data: priceRow } = await admin
    .from("service_prices")
    .select("service_id, services!inner(id, active, visible_in_agenda)")
    .eq("salon_id", SALON_ID)
    .eq("services.visible_in_agenda", true)
    .eq("services.active", true)
    .limit(1)
    .maybeSingle();
  if (!priceRow) {
    log("2.service", "FAIL", "no agenda service");
    process.exit(1);
  }
  const serviceId = Number((priceRow as { service_id: unknown }).service_id);
  const customerId = await ensureSmokeCustomer(admin);

  const slotOccupied = romeTomorrowAt(11, 0);
  const slotFree = romeTomorrowAt(14, 0);

  const createBody = {
    salon_id: SALON_ID,
    customer_id: customerId,
    start_time: slotOccupied,
    notes: `${PREFIX}main`,
    services: [{ service_id: serviceId, staff_id: staffId }],
  };

  const create1 = await apiJson(baseUrl, cookieJar, "/api/agenda/appointments", {
    method: "POST",
    body: JSON.stringify(createBody),
  });
  const apptId = Number(create1.json.appointment_id);
  if (!(create1.status >= 200 && create1.status < 300 && apptId > 0)) {
    log("3.create.first", "FAIL", JSON.stringify(create1.json), create1.status);
    process.exit(1);
  }
  artifacts.appointment_id = apptId;
  log("3.create.first", "PASS", `appointment_id=${apptId}`, create1.status);

  const { data: lineRows } = await admin
    .from("appointment_services")
    .select("id")
    .eq("appointment_id", apptId);
  const lineId = Number((lineRows?.[0] as { id?: unknown })?.id);
  if (!lineId) {
    log("3.line", "FAIL", "no appointment_services row");
    process.exit(1);
  }
  artifacts.line_id = lineId;

  const createDup = await apiJson(baseUrl, cookieJar, "/api/agenda/appointments", {
    method: "POST",
    body: JSON.stringify({ ...createBody, notes: `${PREFIX}dup` }),
  });
  const dupErr = String(createDup.json.error ?? "");
  if (createDup.status === 409 && dupErr.includes("Collaboratore già impegnato")) {
    log("4.overlap.create", "PASS", dupErr, 409);
  } else {
    log("4.overlap.create", "FAIL", `${createDup.status} ${JSON.stringify(createDup.json)}`, createDup.status);
  }

  const moveFree = await apiJson(baseUrl, cookieJar, `/api/agenda/lines/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify({ start_time: slotFree }),
  });
  if (moveFree.status >= 200 && moveFree.status < 300) {
    log("5.drag.free", "PASS", `moved to ${slotFree}`, moveFree.status);
  } else {
    log("5.drag.free", "FAIL", JSON.stringify(moveFree.json), moveFree.status);
  }

  const blocker = await apiJson(baseUrl, cookieJar, "/api/agenda/appointments", {
    method: "POST",
    body: JSON.stringify({
      ...createBody,
      start_time: slotOccupied,
      notes: `${PREFIX}blocker`,
    }),
  });
  const blockerId = Number(blocker.json.appointment_id);
  if (blockerId > 0) artifacts.blocker_id = blockerId;

  const moveConflict = await apiJson(baseUrl, cookieJar, `/api/agenda/lines/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify({ start_time: slotOccupied }),
  });
  const conflictErr = String(moveConflict.json.error ?? "");
  if (moveConflict.status === 409 && conflictErr.includes("Collaboratore già impegnato")) {
    log("5.drag.conflict", "PASS", conflictErr, 409);
  } else {
    log("5.drag.conflict", "FAIL", `${moveConflict.status} ${JSON.stringify(moveConflict.json)}`, moveConflict.status);
  }

  await cleanupSmokeAppointments(admin);
  log("9.cleanup", "PASS", `removed notes LIKE ${PREFIX}%`);

  const fail = results.filter((r) => r.status === "FAIL").length;
  const pass = results.filter((r) => r.status === "PASS").length;
  console.log(`\n--- Riepilogo: PASS=${pass} FAIL=${fail} ---`);
  console.log(`\nP0 AGENDA OVERLAP ROMA: ${fail === 0 ? "GO ✓" : "NO GO ✗"}\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
