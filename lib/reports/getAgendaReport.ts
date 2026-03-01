// lib/reports/getAgendaReport.ts
import { createServerSupabase } from "@/lib/supabaseServer";

export type AgendaReportFilters = {
  salonId: number;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
};

// impostazione enterprise semplice (poi la rendiamo turni reali)
const DAILY_CAPACITY_HOURS = 8;

function isoStart(d: string) {
  return `${d}T00:00:00`;
}
function isoEnd(d: string) {
  return `${d}T23:59:59.999`;
}
function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function getAgendaReport(filters: AgendaReportFilters) {
  const supabase = await createServerSupabase();
  const { salonId, dateFrom, dateTo } = filters;

  // Prendiamo appuntamenti nel range (start_time)
  // Nota: qui assumiamo start_time/end_time come da tua “regola d’oro”
  const { data: appts, error } = await supabase
    .from("appointments")
    .select("id, salon_id, staff_id, start_time, end_time, status")
    .eq("salon_id", salonId)
    .gte("start_time", isoStart(dateFrom))
    .lte("start_time", isoEnd(dateTo));

  if (error) throw new Error(error.message);

  const list = Array.isArray(appts) ? appts : [];

  // ===== Totali =====
  let total = 0;
  let done = 0;
  let no_show = 0;
  let cancelled = 0;
  let in_sala = 0;

  // ===== Daily breakdown =====
  const dailyMap = new Map<
    string,
    { day: string; appointments: number; done: number; no_show: number; cancelled: number }
  >();

  // ===== Staff utilization =====
  const staffMap = new Map<
    string,
    { staff_id: string; booked_minutes: number; days: Set<string> }
  >();

  for (const a of list as any[]) {
    total += 1;

    const status = String(a.status ?? "").toLowerCase();
    if (status === "done") done += 1;
    else if (status === "no_show" || status === "noshow") no_show += 1;
    else if (status === "cancelled" || status === "canceled") cancelled += 1;
    else if (status === "in_sala") in_sala += 1;

    const day = String(a.start_time ?? "").slice(0, 10);
    if (day) {
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { day, appointments: 0, done: 0, no_show: 0, cancelled: 0 });
      }
      const d = dailyMap.get(day)!;
      d.appointments += 1;
      if (status === "done") d.done += 1;
      if (status === "no_show" || status === "noshow") d.no_show += 1;
      if (status === "cancelled" || status === "canceled") d.cancelled += 1;
    }

    // utilization (solo se staff e tempi presenti)
    const sid = a.staff_id ? String(a.staff_id) : null;
    const st = a.start_time ? new Date(a.start_time) : null;
    const en = a.end_time ? new Date(a.end_time) : null;

    if (sid && st && en && Number.isFinite(st.getTime()) && Number.isFinite(en.getTime())) {
      const mins = Math.max(0, Math.round((en.getTime() - st.getTime()) / 60000));
      if (!staffMap.has(sid)) staffMap.set(sid, { staff_id: sid, booked_minutes: 0, days: new Set() });
      const s = staffMap.get(sid)!;
      s.booked_minutes += mins;
      if (day) s.days.add(day);
    }
  }

  const completion_rate = total > 0 ? (done / total) * 100 : 0;

  const totals = {
    appointments: total,
    done,
    no_show,
    cancelled,
    in_sala,
    completion_rate,
  };

  const daily = Array.from(dailyMap.values())
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((x) => ({
      day: x.day,
      appointments: x.appointments,
      done: x.done,
      no_show: x.no_show,
      cancelled: x.cancelled,
      completion_rate: x.appointments > 0 ? (x.done / x.appointments) * 100 : 0,
    }));

  // staff names
  const staffIds = Array.from(staffMap.keys());
  const staffNames = new Map<string, string>();

  if (staffIds.length) {
    const { data: staffRows, error: staffErr } = await supabase
      .from("staff")
      .select("id, name")
      .eq("salon_id", salonId)
      .in("id", staffIds);

    if (staffErr) throw new Error(staffErr.message);

    for (const s of (staffRows ?? []) as any[]) {
      if (s?.id) staffNames.set(String(s.id), String(s.name ?? `Staff ${s.id}`));
    }
  }

  const staffUtilization = Array.from(staffMap.values())
    .map((x) => {
      const working_days = x.days.size;
      const booked_hours = n(x.booked_minutes) / 60;
      const capacity_hours = working_days * DAILY_CAPACITY_HOURS;
      const utilization_pct =
        capacity_hours > 0 ? (booked_hours / capacity_hours) * 100 : 0;

      return {
        staff_id: x.staff_id,
        staff_name: staffNames.get(x.staff_id) ?? `Staff ${x.staff_id}`,
        booked_minutes: x.booked_minutes,
        booked_hours,
        working_days,
        capacity_hours,
        utilization_pct,
      };
    })
    .sort((a, b) => b.utilization_pct - a.utilization_pct);

  return { totals, daily, staffUtilization };
}