import { SLOT_MINUTES, timeToMinutes } from "@/components/agenda/utils";
import type { AgendaAppointment, AgendaServiceLine } from "@/lib/agenda/agendaContract";
import {
  clampDurationMinutes,
  resolveAppointmentServiceOccupancyIntervals,
} from "@/lib/agenda/agendaContract";
import { agendaTimeFromTs, splitAgendaTimestamp } from "@/lib/agenda/agendaTimestamp";

/** Minuti da mezzanotte da start_time agenda (T o spazio). */
export function agendaMinutesFromStartTime(ts: string): number {
  const { time } = splitAgendaTimestamp(ts);
  const [hh, mm] = time.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

/**
 * Durata visiva del box: solo la riga corrente (non somma i servizi fratelli).
 * `appointment` resta in firma per i chiamanti esistenti; non altera la durata.
 */
export function resolveAgendaLineDurationMinutes(
  line: Pick<AgendaServiceLine, "duration_minutes" | "services">,
  _appointment?: Pick<AgendaAppointment, "appointment_services">,
): number {
  void _appointment;
  const explicit = line.duration_minutes;
  if (Number.isFinite(Number(explicit)) && Number(explicit) > 0) {
    return clampDurationMinutes(explicit);
  }

  return clampDurationMinutes(line.services?.duration);
}

/** Top in px dalla prima riga oraria della griglia (allineamento sub-slot). */
export function computeAgendaBoxTopPx(
  startTime: string,
  hours: string[],
  slotPx: number,
): number {
  if (!hours.length) return 0;

  const lineMin = agendaMinutesFromStartTime(startTime);
  const gridStartMin = timeToMinutes(hours[0]!);
  const delta = lineMin - gridStartMin;

  if (Number.isFinite(delta) && delta >= 0) {
    return (delta / SLOT_MINUTES) * slotPx;
  }

  const label = agendaTimeFromTs(startTime);
  const idx = hours.indexOf(label);
  return (idx >= 0 ? idx : 0) * slotPx;
}

export function computeAgendaBoxHeightPx(durationMin: number, slotPx: number): number {
  const dur = clampDurationMinutes(durationMin);
  const raw = (dur / SLOT_MINUTES) * slotPx;
  const minH = Math.max(56, slotPx * 1.35);
  return Math.max(minH, raw);
}

export function computeAgendaBoxLayout(input: {
  line: Pick<AgendaServiceLine, "start_time" | "duration_minutes" | "services">;
  appointment: Pick<AgendaAppointment, "appointment_services">;
  hours: string[];
  slotPx: number;
}): { topPx: number; heightPx: number; durationMin: number } {
  const durationMin = resolveAgendaLineDurationMinutes(input.line, input.appointment);
  return {
    durationMin,
    topPx: computeAgendaBoxTopPx(input.line.start_time, input.hours, input.slotPx),
    heightPx: computeAgendaBoxHeightPx(durationMin, input.slotPx),
  };
}

export type AgendaLineVisualSegment = {
  kind: "busy" | "free";
  startOffsetMinutes: number;
  endOffsetMinutes: number;
  /** Frazione 0–1 dell'altezza display. */
  topFraction: number;
  heightFraction: number;
};

/**
 * Segmenti UI (pieno / posa trasparente) allineati al contratto occupancy.
 * Senza posa valida → un solo segmento busy sull'intero display.
 */
export function resolveAgendaLineVisualSegments(
  line: Pick<
    AgendaServiceLine,
    "duration_minutes" | "duration_active" | "duration_processing" | "need_processing"
  >,
): AgendaLineVisualSegment[] {
  const occ = resolveAppointmentServiceOccupancyIntervals({
    duration_minutes: line.duration_minutes,
    duration_active: line.duration_active,
    duration_processing: line.duration_processing,
    need_processing: line.need_processing,
  });
  const D = occ.display.endOffsetMinutes;
  if (D <= 0) return [];

  const raw: Array<{ kind: "busy" | "free"; start: number; end: number }> = [];
  for (const b of occ.busy) {
    raw.push({
      kind: "busy",
      start: b.startOffsetMinutes,
      end: b.endOffsetMinutes,
    });
  }
  for (const f of occ.free) {
    raw.push({
      kind: "free",
      start: f.startOffsetMinutes,
      end: f.endOffsetMinutes,
    });
  }
  raw.sort((a, b) => a.start - b.start);

  return raw
    .filter((s) => s.end > s.start)
    .map((s) => ({
      kind: s.kind,
      startOffsetMinutes: s.start,
      endOffsetMinutes: s.end,
      topFraction: s.start / D,
      heightFraction: (s.end - s.start) / D,
    }));
}
