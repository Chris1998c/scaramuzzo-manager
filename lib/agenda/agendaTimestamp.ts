/**
 * Parsing timestamp agenda: ISO con "T" o formato Postgres con spazio.
 * Nessuno shift UTC — wall clock locale come in DB.
 */

export function splitAgendaTimestamp(ts: string): { date: string; time: string } {
  const raw = String(ts ?? "").trim();
  if (!raw) {
    return { date: "", time: "00:00:00" };
  }

  if (raw.includes("T")) {
    const [date, time = "00:00:00"] = raw.split("T");
    return { date, time };
  }

  const spaceIdx = raw.indexOf(" ");
  if (spaceIdx > 0) {
    return {
      date: raw.slice(0, spaceIdx),
      time: raw.slice(spaceIdx + 1).trim() || "00:00:00",
    };
  }

  return { date: raw, time: "00:00:00" };
}

/** HH:MM da timestamp agenda (T o spazio). */
export function agendaTimeFromTs(ts: string): string {
  const { time } = splitAgendaTimestamp(ts);
  const [hh, mm] = time.split(":");
  if (!hh || !mm) return "";
  return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`.slice(0, 5);
}

export function parseAgendaLocalTs(ts: string): Date {
  const { date, time } = splitAgendaTimestamp(ts);
  const [y, m, d] = String(date || "").split("-").map(Number);
  const [hh, mm, ss] = String(time || "00:00:00").split(":").map(Number);
  return new Date(y || 0, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0, 0);
}
