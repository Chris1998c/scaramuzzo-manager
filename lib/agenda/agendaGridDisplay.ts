import type { AgendaAppointment, AgendaServiceLine } from "@/lib/agenda/agendaContract";

function sortLinesByStart(lines: AgendaServiceLine[]): AgendaServiceLine[] {
  return [...lines].sort((a, b) => {
    const byStart = String(a.start_time).localeCompare(String(b.start_time));
    if (byStart !== 0) return byStart;
    return Number(a.id) - Number(b.id);
  });
}

/**
 * Righe da renderizzare in AgendaGrid: un blocco per ogni appointment_services valido.
 * Usa start_time / duration_minutes / staff_id della riga (niente collapse né somma durate).
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

  return sortLinesByStart(lines);
}

/**
 * Solo la prima riga (start minimo, poi id) mostra azioni a livello appuntamento
 * (in sala, cassa, annullamento), per evitare menu duplicati sui box fratelli.
 */
export function isAgendaAppointmentActionsLine(
  app: AgendaAppointment,
  lineId: number | string | null | undefined,
): boolean {
  if (lineId == null || lineId === "") return false;
  const lines = getAgendaDisplayServiceLines(app);
  if (!lines.length) return false;
  return String(lines[0]!.id) === String(lineId);
}
