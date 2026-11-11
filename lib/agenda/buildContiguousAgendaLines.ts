import {
  parseLocal,
  snapToAgendaSlot,
  toNoZ,
} from "@/lib/agenda/agendaContract";
import { computeLineEndTime } from "@/lib/agenda/assertStaffSlotFree";

export type ContiguousAgendaDurationLine = {
  duration_minutes: number;
};

export type ContiguousAgendaTimedLine<T extends ContiguousAgendaDurationLine> = T & {
  start_time: string;
  end_time: string;
};

/**
 * Orari contigue per create agenda / walk-in / booking app clienti.
 *
 * - Prima riga: inizio snappato alla griglia (15 min).
 * - Righe successive: partono alla fine reale della precedente (nessuno snap indietro).
 *
 * Evita il bug storico “snap per riga” (es. 20+30 → 10:00 / 10:15 overlap interno).
 */
export function buildContiguousAgendaLines<T extends ContiguousAgendaDurationLine>(
  requestedStartTime: string,
  lines: T[],
): ContiguousAgendaTimedLine<T>[] {
  if (!lines.length) return [];

  const built: ContiguousAgendaTimedLine<T>[] = [];
  let cursorMs = parseLocal(requestedStartTime).getTime();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const lineStart =
      index === 0
        ? toNoZ(snapToAgendaSlot(parseLocal(requestedStartTime)))
        : toNoZ(new Date(cursorMs));
    const lineEnd = computeLineEndTime(lineStart, line.duration_minutes);

    built.push({
      ...line,
      start_time: lineStart,
      end_time: lineEnd,
    });

    cursorMs = parseLocal(lineStart).getTime() + line.duration_minutes * 60_000;
  }

  return built;
}

/** Riproduzione del vecchio algoritmo manager (snap su ogni cursor) — solo per test. */
export function buildLegacySnappedPerLineAgendaStarts(
  requestedStartTime: string,
  durationMinutesList: number[],
): string[] {
  const snappedStart = toNoZ(snapToAgendaSlot(parseLocal(requestedStartTime)));
  let cursorMs = parseLocal(snappedStart).getTime();
  const starts: string[] = [];
  for (const duration of durationMinutesList) {
    starts.push(toNoZ(snapToAgendaSlot(new Date(cursorMs))));
    cursorMs += duration * 60_000;
  }
  return starts;
}
