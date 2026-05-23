/** Helper date ISO (YYYY-MM-DD) per confronti cockpit Riepilogo. */

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoDateOffset(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function yesterdayISO(from = todayISO()): string {
  return isoDateOffset(from, -1);
}

/** Stesso giorno della settimana precedente (7 giorni fa). */
export function sameWeekdayLastWeek(iso: string): string {
  return isoDateOffset(iso, -7);
}

export function startOfMonthISO(from = new Date()): string {
  const y = from.getFullYear();
  const m = from.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Inizio settimana corrente (lunedì) in Europe/Rome approssimato via offset locale. */
export function startOfWeekISO(fromIso = todayISO()): string {
  const d = new Date(`${fromIso}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}
