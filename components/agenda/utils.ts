// components/agenda/utils.ts

/* ----------------------------------------- */
/*      FORMAT / PARSE TIMESTAMP (DB)        */
/* ----------------------------------------- */

export function dayFromTs(ts: string) {
  return String(ts).split("T")[0];
}

export function timeFromTs(ts: string) {
  const t = String(ts).split("T")[1] || "";
  return t.slice(0, 5);
}

/* ----------------------------------------- */
/*           GENERA ORE GIORNALIERE          */
/* ----------------------------------------- */

export function generateHours(start: string, end: string, stepMin: number): string[] {
  const step = Math.max(1, Number(stepMin || 30));

  const startM = timeToMinutesSafe(start);
  const endM = timeToMinutesSafe(end);

  if (startM == null || endM == null) return [];

  // se end < start, ritorna vuoto (input errato)
  if (endM < startM) return [];

  const res: string[] = [];
  for (let m = startM; m <= endM; m += step) {
    res.push(minutesToTime(m));
  }
  return res;
}

/* ----------------------------------------- */
/*           ORA → MINUTI                    */
/* ----------------------------------------- */

export function timeToMinutes(t: string): number {
  const parsed = timeToMinutesSafe(t);
  return parsed ?? 0;
}

function timeToMinutesSafe(t: string): number | null {
  const parts = String(t).split(":");
  if (parts.length < 2) return null;

  const h = Number(parts[0]);
  const m = Number(parts[1]);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23) return null;
  if (m < 0 || m > 59) return null;

  return h * 60 + m;
}

/* ----------------------------------------- */
/*           MINUTI → ORA                    */
/* ----------------------------------------- */

export function minutesToTime(mins: number): string {
  const total = Math.max(0, Math.floor(Number(mins) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad(h)}:${pad(m)}`;
}

/* ----------------------------------------- */
/*      POSIZIONE BOX IN PIXEL               */
/* ----------------------------------------- */

export function getBoxTop(time: string, hours: string[], slotPx = 40) {
  const index = hours.indexOf(time);
  return index < 0 ? 0 : index * slotPx;
}

/* ----------------------------------------- */
/*      ALTEZZA BOX IN PIXEL                 */
/* ----------------------------------------- */

export function getBoxHeight(durationMin: number, step = 30, slotPx = 40) {
  const dur = Math.max(0, Number(durationMin) || 0);
  const s = Math.max(1, Number(step) || 30);
  return (dur / s) * slotPx;
}

/* ----------------------------------------- */
/*      DURATA (min) DA start/end_time       */
/*  - clamp min 30                           */
/*  - arrotonda a 1 decimale (stabile)       */
/* ----------------------------------------- */

export function durationFromTimestamps(start_time: string, end_time?: string | null) {
  if (!end_time) return 30;

  const start = new Date(start_time).getTime();
  const end = new Date(end_time).getTime();

  const mins = (end - start) / 60000;

  if (!Number.isFinite(mins) || mins <= 0) return 30;

  // evita valori strani (es 29.999999)
  const rounded = Math.round(mins * 10) / 10;
  return Math.max(30, rounded);
}

/* ----------------------------------------- */
/*      SOMMA DURATE appointment_services     */
/*  usa duration_minutes                     */
/*  - se somma 0 => 30                       */
/* ----------------------------------------- */

export function sumServiceDurationsMinutes(appointment_services: any[]) {
  const sum = (appointment_services || [])
    .map((r) => Number(r?.duration_minutes ?? 0))
    .reduce((a, b) => a + b, 0);

  return sum > 0 ? sum : 30;
}

/* ----------------------------------------- */
/*      GENERA 7 GIORNI SETTIMANA (lun-dom)   */
/*  dalla data base passata (yyyy-mm-dd)     */
/*  FIX: domenica corretta                   */
/* ----------------------------------------- */

export function generateWeekDaysFromDate(dateString: string): { label: string; date: string }[] {
  const base = new Date(dateString);
  const day = base.getDay() || 7; // lun=1..dom=7

  const days: { label: string; date: string }[] = [];

  for (let i = 1; i <= 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - (day - i));

    days.push({
      date: d.toISOString().split("T")[0],
      label: d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" }),
    });
  }

  return days;
}

/* ----------------------------------------- */
/*  PROSSIMO SLOT LIBERO (usa start_time)     */
/*  day: yyyy-mm-dd                          */
/* ----------------------------------------- */

export function findNextAvailable(
  appointments: any[],
  hours: string[],
  day: string // yyyy-mm-dd
): string | null {
  const booked = new Set(
    (appointments || [])
      .map((a) => String(a?.start_time || ""))
      .filter((s) => s.startsWith(day))
      .map((ts) => (ts.split("T")[1] || "").slice(0, 5))
  );

  for (const h of hours) {
    if (!booked.has(h)) return h;
  }
  return null;
}

/* ----------------------------------------- */
/*      UTILITY PAD                           */
/* ----------------------------------------- */

function pad(n: number) {
  return String(n).padStart(2, "0");
}
