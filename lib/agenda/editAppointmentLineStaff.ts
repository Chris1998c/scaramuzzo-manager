import { normalizeStaffId } from "@/lib/agenda/agendaContract";

export type LineStaffDraftSource = {
  id: number | string;
  staff_id?: number | null;
  name?: string | null;
};

/** Draft UI: chiave = id riga, valore stringa staff o null (non assegnato). */
export function seedLineStaffDraft(
  lines: LineStaffDraftSource[],
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const l of lines) {
    if (l?.id == null || l.id === "") continue;
    const key = String(l.id);
    const sid = normalizeStaffId(l.staff_id);
    out[key] = sid != null ? String(sid) : null;
  }
  return out;
}

export type LineStaffPatch = {
  lineId: number;
  staff_id: number | null;
  serviceName: string;
};

/**
 * Solo le righe il cui staff nel draft differisce da quello server.
 * Non include orari, durate o altri campi.
 */
export function collectChangedLineStaffPatches(args: {
  lines: LineStaffDraftSource[];
  draftByLineId: Record<string, string | null | undefined>;
}): LineStaffPatch[] {
  const out: LineStaffPatch[] = [];
  for (const l of args.lines) {
    if (l?.id == null || l.id === "") continue;
    const lineId = Number(l.id);
    if (!Number.isFinite(lineId) || lineId <= 0) continue;
    const key = String(l.id);
    if (!Object.prototype.hasOwnProperty.call(args.draftByLineId, key)) continue;
    const next = normalizeStaffId(args.draftByLineId[key]);
    const prev = normalizeStaffId(l.staff_id);
    if (next === prev) continue;
    out.push({
      lineId,
      staff_id: next,
      serviceName: String(l.name ?? "Servizio").trim() || "Servizio",
    });
  }
  return out;
}

/** Messaggio per salvataggio multi-PATCH non atomico (successi + fallimento). */
export function formatLineStaffSaveFailureMessage(args: {
  succeeded: Array<{ serviceName: string }>;
  failedServiceName: string;
  failedMessage: string;
  remainingCount: number;
}): string {
  const parts: string[] = [];
  if (args.succeeded.length > 0) {
    parts.push(
      `Collaboratore aggiornato per: ${args.succeeded
        .map((s) => s.serviceName)
        .join(", ")}.`,
    );
  }
  parts.push(
    `Non aggiornato: ${args.failedServiceName} (${args.failedMessage}).`,
  );
  if (args.remainingCount > 0) {
    parts.push(
      `${args.remainingCount} ${
        args.remainingCount === 1
          ? "altra modifica non inviata"
          : "altre modifiche non inviate"
      }.`,
    );
  }
  parts.push("Ricarica i dati dal server prima di riprovare.");
  return parts.join(" ");
}
