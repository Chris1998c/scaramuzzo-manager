import type { AgendaAppointment, AgendaServiceLine } from "@/lib/agenda/agendaContract";
import { clampDurationMinutes } from "@/lib/agenda/agendaContract";

function sortLinesByStart(lines: AgendaServiceLine[]): AgendaServiceLine[] {
  return [...lines].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
}

function lineDurationMinutes(line: AgendaServiceLine): number {
  return clampDurationMinutes(line.duration_minutes ?? line.services?.duration);
}

/**
 * Righe da renderizzare in AgendaGrid: un solo box per appuntamento.
 * Multi-servizio → prima riga (start minimo) con durata = somma righe (blocco continuo).
 */
export function getAgendaDisplayServiceLines(
  app: AgendaAppointment,
): AgendaServiceLine[] {
  const lines = (app.appointment_services ?? []).filter(
    (ln) => ln.id != null && Number.isFinite(Number(ln.id)) && Number(ln.id) > 0,
  );

  if (!lines.length) {
    return [];
  }

  if (lines.length === 1) {
    return lines;
  }

  const sorted = sortLinesByStart(lines);
  const primary = sorted[0];
  const totalDuration = sorted.reduce((sum, ln) => sum + lineDurationMinutes(ln), 0);

  return [
    {
      ...primary,
      duration_minutes: totalDuration,
    },
  ];
}
