import { SLOT_MINUTES, timeToMinutes } from "@/components/agenda/utils";
import type { AgendaAppointment, AgendaServiceLine } from "@/lib/agenda/agendaContract";
import { clampDurationMinutes } from "@/lib/agenda/agendaContract";
import { agendaTimeFromTs, splitAgendaTimestamp } from "@/lib/agenda/agendaTimestamp";

/** Minuti da mezzanotte da start_time agenda (T o spazio). */
export function agendaMinutesFromStartTime(ts: string): number {
  const { time } = splitAgendaTimestamp(ts);
  const [hh, mm] = time.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

/**
 * Durata visiva del box: per multi-servizio usa sempre la somma delle righe,
 * non `services.duration` della prima riga (es. Colore 35 min).
 */
export function resolveAgendaLineDurationMinutes(
  line: Pick<AgendaServiceLine, "duration_minutes" | "services">,
  appointment: Pick<AgendaAppointment, "appointment_services">,
): number {
  const lines = appointment.appointment_services ?? [];

  if (lines.length > 1) {
    const total = lines.reduce(
      (sum, ln) => sum + clampDurationMinutes(ln.duration_minutes ?? ln.services?.duration),
      0,
    );
    if (total >= SLOT_MINUTES) {
      return total;
    }
  }

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
