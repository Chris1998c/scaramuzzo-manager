/**
 * Bench salvataggio/modifica Agenda su Next isolato (DB locale).
 * Misura: request_ms (HTTP) e click_to_agenda_ms (POST/PATCH + reload lista fino a match).
 *
 * Usage:
 *   node scripts/cleanup/bench-agenda-save-modify-isolated.mjs [--label before|after] [--runs 5]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createServerClient } from "@supabase/ssr";

const label = process.argv.includes("--label")
  ? process.argv[process.argv.indexOf("--label") + 1]
  : "run";
const runs = Number(
  process.argv.includes("--runs")
    ? process.argv[process.argv.indexOf("--runs") + 1]
    : 5,
);

const auth = JSON.parse(readFileSync("/tmp/scz-isolated-auth.json", "utf8"));
const baseUrl = (process.env.BASE_URL || "http://localhost:3010").replace(/\/$/, "");
const outDir = resolve(
  "scripts/cleanup/exports/receptionist-collaudo-2026-11-26/agenda-timing",
);
mkdirSync(outDir, { recursive: true });

const cookieJar = [];
const authClient = createServerClient(auth.api, auth.anon, {
  cookies: {
    getAll() {
      return cookieJar;
    },
    setAll(cookiesToSet) {
      for (const c of cookiesToSet) {
        const idx = cookieJar.findIndex((x) => x.name === c.name);
        if (idx >= 0) cookieJar[idx] = { name: c.name, value: c.value };
        else cookieJar.push({ name: c.name, value: c.value });
      }
    },
  },
});

const { error: signErr } = await authClient.auth.signInWithPassword({
  email: auth.email,
  password: auth.password,
});
if (signErr) throw signErr;
const cookieHeader = cookieJar.map((c) => `${c.name}=${c.value}`).join("; ");

function pad(n) {
  return String(n).padStart(2, "0");
}
/** Prossimo weekday (lun–sab) + offset settimane, orario locale. */
function nextWeekdayAt(hour, minute, weekOffset = 0, weekdayIndex = 0) {
  // weekdayIndex 0 = next Monday … 5 = next Saturday
  const d = new Date();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const daysUntilMonday = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMonday + weekOffset * 7 + weekdayIndex);
  d.setHours(hour, minute, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}:00`;
}

async function api(path, method = "GET", body) {
  const t0 = performance.now();
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const request_ms = Math.round(performance.now() - t0);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  const serverTiming = res.headers.get("server-timing") || "";
  return { status: res.status, request_ms, json, serverTiming };
}

async function agendaHasAppointment(appointmentId, dayStart) {
  const day = dayStart.slice(0, 10);
  const { data, error } = await authClient
    .from("appointments")
    .select("id, start_time, appointment_services(id, start_time)")
    .eq("salon_id", auth.salon_id)
    .eq("id", appointmentId)
    .gte("start_time", `${day}T00:00:00`)
    .lte("start_time", `${day}T23:59:59`)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

async function reloadAgendaVisible(appointmentId, dayStart, expectStart) {
  // Simula onCreated → loadAppointments (stesso client RLS) fino a riga aggiornata.
  const day = dayStart.slice(0, 10);
  const t0 = performance.now();
  for (let i = 0; i < 80; i++) {
    const { data, error } = await authClient
      .from("appointments")
      .select(
        "id, start_time, status, appointment_services(id, start_time, staff_id, duration_minutes)",
      )
      .eq("salon_id", auth.salon_id)
      .gte("start_time", `${day}T00:00:00`)
      .lte("start_time", `${day}T23:59:59`)
      .order("start_time", { ascending: true });
    if (error) throw error;
    const row = (data || []).find((r) => Number(r.id) === Number(appointmentId));
    if (row) {
      const lineStart = row.appointment_services?.[0]?.start_time || row.start_time;
      if (!expectStart || String(lineStart).startsWith(expectStart.slice(0, 16))) {
        return Math.round(performance.now() - t0);
      }
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return Math.round(performance.now() - t0);
}

const saveSamples = [];
const modifySamples = [];

console.log(`\n=== agenda bench label=${label} runs=${runs} base=${baseUrl} ===\n`);

// Martedì: before=questa/prossima settimana, after=settimana successiva (slot dedicati).
const weekOffset = label.startsWith("after") ? 1 : 0;
for (let i = 0; i < runs; i++) {
  const startMin = 10 * 60 + i * 45;
  const start = nextWeekdayAt(Math.floor(startMin / 60), startMin % 60, weekOffset, 1);
  const tClick = performance.now();
  const create = await api("/api/agenda/appointments", "POST", {
    salon_id: auth.salon_id,
    customer_id: auth.customer_id,
    start_time: start,
    notes: `SYN_BENCH_${label}_SAVE_${i}`,
    services: [
      {
        service_id: auth.service_id,
        staff_id: auth.staff_id,
        duration_minutes: 30,
        price: 25,
        vat_rate: 22,
      },
    ],
  });
  const appointmentId = Number(create.json.appointment_id);
  if (create.status >= 300 || !appointmentId) {
    console.log("SAVE FAIL", i, create);
    break;
  }
  const reload_ms = await reloadAgendaVisible(appointmentId, start, start);
  const click_to_agenda_ms = Math.round(performance.now() - tClick);
  const sample = {
    i,
    appointment_id: appointmentId,
    request_ms: create.request_ms,
    reload_ms,
    click_to_agenda_ms,
    serverTiming: create.serverTiming,
  };
  saveSamples.push(sample);
  console.log(
    `SAVE#${i} request=${sample.request_ms}ms reload=${sample.reload_ms}ms click→agenda=${sample.click_to_agenda_ms}ms timing=${sample.serverTiming || "-"}`,
  );
}

for (let i = 0; i < Math.min(runs, saveSamples.length); i++) {
  const apptId = saveSamples[i].appointment_id;
  const { data: lines } = await authClient
    .from("appointment_services")
    .select("id, start_time")
    .eq("appointment_id", apptId)
    .limit(1);
  const lineId = Number(lines?.[0]?.id);
  const oldStart = String(lines?.[0]?.start_time || "");
  const day = oldStart.slice(0, 10);
  // 45′ di distanza (durata riga = 30′) per evitare overlap tra prove.
  const moveMin = 17 * 60 + i * 45;
  const newStart = `${day}T${pad(Math.floor(moveMin / 60))}:${pad(moveMin % 60)}:00`;
  const tClick = performance.now();
  const patch = await api(`/api/agenda/lines/${lineId}`, "PATCH", {
    start_time: newStart,
  });
  if (patch.status >= 300) {
    console.log("MODIFY FAIL", i, patch);
    break;
  }
  const reload_ms = await reloadAgendaVisible(apptId, newStart, newStart);
  const click_to_agenda_ms = Math.round(performance.now() - tClick);
  const sample = {
    i,
    appointment_id: apptId,
    line_id: lineId,
    request_ms: patch.request_ms,
    reload_ms,
    click_to_agenda_ms,
    serverTiming: patch.serverTiming,
  };
  modifySamples.push(sample);
  console.log(
    `MODIFY#${i} request=${sample.request_ms}ms reload=${sample.reload_ms}ms click→agenda=${sample.click_to_agenda_ms}ms timing=${sample.serverTiming || "-"}`,
  );
}

function median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

const summary = {
  label,
  baseUrl,
  at: new Date().toISOString(),
  save: {
    n: saveSamples.length,
    request_ms: saveSamples.map((s) => s.request_ms),
    click_to_agenda_ms: saveSamples.map((s) => s.click_to_agenda_ms),
    median_request_ms: median(saveSamples.map((s) => s.request_ms)),
    median_click_to_agenda_ms: median(saveSamples.map((s) => s.click_to_agenda_ms)),
    samples: saveSamples,
  },
  modify: {
    n: modifySamples.length,
    request_ms: modifySamples.map((s) => s.request_ms),
    click_to_agenda_ms: modifySamples.map((s) => s.click_to_agenda_ms),
    median_request_ms: median(modifySamples.map((s) => s.request_ms)),
    median_click_to_agenda_ms: median(modifySamples.map((s) => s.click_to_agenda_ms)),
    samples: modifySamples,
  },
};

const outPath = resolve(outDir, `bench-${label}.json`);
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`\nWrote ${outPath}`);
console.log(
  `SAVE median request=${summary.save.median_request_ms} click→agenda=${summary.save.median_click_to_agenda_ms}`,
);
console.log(
  `MODIFY median request=${summary.modify.median_request_ms} click→agenda=${summary.modify.median_click_to_agenda_ms}`,
);
