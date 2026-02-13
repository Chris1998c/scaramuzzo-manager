/* =====================================================
   SCARAMUZZO MANAGER – AGENDA UTILS (DEFINITIVE)
   - Zero shift UTC
   - Snap 15 minuti
   - Week lun-dom
   - Calcoli robusti
   - Ready for future extensions
===================================================== */

/* -----------------------------------------
   SLOT CONFIG (AGENDA CORE)
----------------------------------------- */

export const SLOT_MINUTES = 15; // Step ufficiale gestionale
export const SLOT_PX = 28;      // Altezza slot (coerente con UI compatta)

/* -----------------------------------------
   DATE / TIME SAFE HELPERS (NO UTC SHIFT)
----------------------------------------- */

/**
 * Restituisce YYYY-MM-DD da timestamp ISO
 */
export function dayFromTs(ts: string): string {
  if (!ts) return "";
  return String(ts).split("T")[0];
}

/**
 * Restituisce HH:MM robusto anche con secondi/Z
 */
export function timeFromTs(ts: string): string {
  if (!ts) return "";
  const parts = String(ts).split("T");
  if (parts.length < 2) return "";
  return parts[1].slice(0, 5);
}

/**
 * Parsing locale sicuro (NO Z shift)
 */
export function parseLocal(ts: string): Date {
  const [date, time] = String(ts).split("T");
  const [y, m, d] = String(date || "").split("-").map(Number);
  const [hh, mm, ss] = String(time || "00:00:00").split(":").map(Number);

  return new Date(
    y || 0,
    (m || 1) - 1,
    d || 1,
    hh || 0,
    mm || 0,
    ss || 0,
    0
  );
}

/**
 * Format YYYY-MM-DDTHH:mm:ss senza Z
 */
export function toNoZ(dt: Date): string {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
    dt.getDate()
  )}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(
    dt.getSeconds()
  )}`;
}

/* -----------------------------------------
   GENERAZIONE ORE GIORNALIERE
----------------------------------------- */

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

/* -----------------------------------------
   TIME ↔ MINUTES
----------------------------------------- */

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

export function minutesToTime(mins: number): string {
  const total = Math.max(0, Math.floor(Number(mins) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad(h)}:${pad(m)}`;
}

/* -----------------------------------------
   SNAP A SLOT (DRAG)
----------------------------------------- */

export function snapMinutesToSlot(
  minutes: number,
  slot: number = SLOT_MINUTES
): number {
  const s = Math.max(1, Number(slot) || SLOT_MINUTES);
  return Math.round(minutes / s) * s;
}

/* -----------------------------------------
   POSIZIONE BOX (PIXEL)
----------------------------------------- */

export function getBoxTop(
  time: string,
  hours: string[],
  slotPx = SLOT_PX
): number {
  const index = hours.indexOf(time);
  return index < 0 ? 0 : index * slotPx;
}

export function getBoxHeight(
  durationMin: number,
  step = SLOT_MINUTES,
  slotPx = SLOT_PX
): number {
  const dur = Math.max(step, Number(durationMin) || step);
  return (dur / step) * slotPx;
}

/* -----------------------------------------
   DURATA DA start/end_time
----------------------------------------- */

export function durationFromTimestamps(
  start_time: string,
  end_time?: string | null
): number {
  if (!start_time || !end_time) return SLOT_MINUTES * 2;

  const startM = timeToMinutes(timeFromTs(start_time));
  const endM = timeToMinutes(timeFromTs(end_time));

  const diff = endM - startM;

  if (!Number.isFinite(diff) || diff <= 0) {
    return SLOT_MINUTES * 2;
  }

  return snapMinutesToSlot(diff);
}

/* -----------------------------------------
   SOMMA DURATE appointment_services
----------------------------------------- */

export function sumServiceDurationsMinutes(
  appointment_services: any[]
): number {
  const sum = (appointment_services || [])
    .map((r) => Number(r?.duration_minutes ?? 0))
    .reduce((a, b) => a + b, 0);

  return sum > 0 ? sum : SLOT_MINUTES * 2;
}

/* -----------------------------------------
   SETTIMANA LUN → DOM (NO UTC SHIFT)
----------------------------------------- */

export function generateWeekDaysFromDate(
  dateString: string
): { label: string; date: string }[] {
  const base = parseLocal(`${dateString}T00:00:00`);
  const day = base.getDay() || 7; // lun=1..dom=7

  const days: { label: string; date: string }[] = [];

  for (let i = 1; i <= 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - (day - i));

    days.push({
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
        d.getDate()
      )}`,
      label: d.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    });
  }

  return days;
}

/* -----------------------------------------
   PROSSIMO SLOT LIBERO (base semplice)
----------------------------------------- */

export function findNextAvailable(
  appointments: any[],
  hours: string[],
  day: string
): string | null {
  const booked = new Set(
    (appointments || [])
      .map((a) => String(a?.start_time || ""))
      .filter((s) => s.startsWith(day))
      .map((ts) => timeFromTs(ts))
  );

  for (const h of hours) {
    if (!booked.has(h)) return h;
  }

  return null;
}

/* -----------------------------------------
   CLAMP GENERICO
----------------------------------------- */

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/* -----------------------------------------
   INTERNAL
----------------------------------------- */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
