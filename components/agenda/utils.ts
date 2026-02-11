// components/agenda/utils.ts

/* ----------------------------------------- */
/* SLOT CONFIG (AGENDA)             */
/* ----------------------------------------- */

export const SLOT_MINUTES = 15; // scaglioni 15 minuti
export const SLOT_PX = 28;      // RIDOTTO per visuale compatta (era 32)

/* ----------------------------------------- */
/* FORMAT / PARSE TIMESTAMP (DB)        */
/* ----------------------------------------- */

export function dayFromTs(ts: string) {
  if (!ts) return "";
  return String(ts).split("T")[0];
}

export function timeFromTs(ts: string) {
  if (!ts) return "";
  const t = String(ts).split("T")[1] || "";
  return t.slice(0, 5);
}

/* ----------------------------------------- */
/* GENERA ORE GIORNALIERE          */
/* ----------------------------------------- */

export function generateHours(
  start: string,
  end: string,
  stepMin: number = SLOT_MINUTES
): string[] {
  const step = Math.max(1, Number(stepMin || SLOT_MINUTES));

  const startM = timeToMinutesSafe(start);
  const endM = timeToMinutesSafe(end);

  if (startM == null || endM == null) return [];
  if (endM < startM) return [];

  const res: string[] = [];
  for (let m = startM; m <= endM; m += step) {
    res.push(minutesToTime(m));
  }
  return res;
}

/* ----------------------------------------- */
/* ORA → MINUTI                    */
/* ----------------------------------------- */

export function timeToMinutes(t: string): number {
  return timeToMinutesSafe(t) ?? 0;
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
/* MINUTI → ORA                    */
/* ----------------------------------------- */

export function minutesToTime(mins: number): string {
  const total = Math.max(0, Math.floor(Number(mins) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad(h)}:${pad(m)}`;
}

/* ----------------------------------------- */
/* POSIZIONE BOX IN PIXEL               */
/* ----------------------------------------- */

export function getBoxTop(time: string, hours: string[], slotPx = SLOT_PX) {
  const index = hours.indexOf(time);
  return index < 0 ? 0 : index * slotPx;
}

/* ----------------------------------------- */
/* ALTEZZA BOX IN PIXEL                 */
/* ----------------------------------------- */

export function getBoxHeight(
  durationMin: number,
  step = SLOT_MINUTES,
  slotPx = SLOT_PX
) {
  const dur = Math.max(0, Number(durationMin) || 0);
  const s = Math.max(1, Number(step) || SLOT_MINUTES);
  // Restituisce l'altezza esatta in pixel basata sulla durata
  return Math.max(slotPx, (dur / s) * slotPx);
}

/* ----------------------------------------- */
/* DURATA (min) DA start/end_time       */
/* ----------------------------------------- */

export function durationFromTimestamps(
  start_time: string,
  end_time?: string | null
) {
  if (!end_time) return 30;

  const startM = timeToMinutes(timeFromTs(start_time));
  const endM = timeToMinutes(timeFromTs(end_time));

  const mins = endM - startM;

  if (!Number.isFinite(mins) || mins <= 0) return 30;
  // Per l'uso quotidiano, permettiamo anche scatti da 15 min
  return mins; 
}

/* ----------------------------------------- */
/* SOMMA DURATE appointment_services    */
/* ----------------------------------------- */

export function sumServiceDurationsMinutes(appointment_services: any[]) {
  const sum = (appointment_services || [])
    .map((r) => Number(r?.duration_minutes ?? 0))
    .reduce((a, b) => a + b, 0);

  return sum > 0 ? sum : 30;
}

/* ----------------------------------------- */
/* GENERA 7 GIORNI SETTIMANA (lun-dom)  */
/* ----------------------------------------- */

export function generateWeekDaysFromDate(
  dateString: string
): { label: string; date: string }[] {
  const base = new Date(`${dateString}T00:00:00`);
  const day = base.getDay() || 7; // lun=1..dom=7

  const days: { label: string; date: string }[] = [];

  for (let i = 1; i <= 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - (day - i));

    days.push({
      date: d.toISOString().split("T")[0],
      label: d.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    });
  }

  return days;
}

/* ----------------------------------------- */
/* PROSSIMO SLOT LIBERO (usa start_time)    */
/* ----------------------------------------- */

export function findNextAvailable(
  appointments: any[],
  hours: string[],
  day: string
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
/* UTILITY INTERNE                      */
/* ----------------------------------------- */

function pad(n: number) {
  return String(n).padStart(2, "0");
}