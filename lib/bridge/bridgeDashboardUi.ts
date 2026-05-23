import type { BridgeDashboardEnrichedRow } from "@/lib/bridge/buildBridgeDashboardRows";
import type { BridgeFiscalSnapshot } from "@/lib/bridge/bridgeFiscalTypes";
import type { BridgeLastJobSummary } from "@/lib/bridge/bridgeFiscalTypes";

export type FiscalCassaStatus = "operativo" | "attenzione" | "offline";

export type HumanProblem = {
  code: string;
  title: string;
  detail: string;
  tone: "amber" | "red";
};

const WARNING_HUMAN: Record<string, { title: string; detail: string }> = {
  bridge_offline: {
    title: "Computer cassa non raggiungibile",
    detail: "Il sistema non riceve aggiornamenti dal PC cassa da più di 2 minuti.",
  },
  installation_revoked: {
    title: "Collegamento cassa disattivato",
    detail: "Questa installazione è stata revocata: serve un nuovo token dal coordinator.",
  },
  fpmate_unreachable: {
    title: "Stampante fiscale non risponde",
    detail: "FPMate non è raggiungibile dalla cassa. Verificare rete e accensione stampante.",
  },
  failed_jobs: {
    title: "Stampe non completate",
    detail: "Ci sono documenti segnati come falliti: controllare prima di ritentare.",
  },
  reconcile_required: {
    title: "Verifica sulla stampante necessaria",
    detail: "Prima di un nuovo tentativo, controllare se lo scontrino è uscito fisicamente.",
  },
  processing_stuck: {
    title: "Stampa bloccata in elaborazione",
    detail: "Un documento è in elaborazione da troppo tempo: controllare FPMate.",
  },
  processing_active: {
    title: "Stampa in corso",
    detail: "Un documento è in elaborazione: attendere qualche minuto.",
  },
  pending_stuck: {
    title: "Documenti in attesa da troppo tempo",
    detail: "La coda ha documenti in attesa oltre la soglia prevista.",
  },
  z_report_missing_today: {
    title: "Chiusura giornaliera (Z) non eseguita",
    detail: "Oggi non risulta ancora una Z completata per questo salone.",
  },
};

export function deriveFiscalCassaStatus(row: BridgeDashboardEnrichedRow): FiscalCassaStatus {
  if (row.revoked_at || !row.online) return "offline";
  const hasRed = row.warnings.some((w) => w.severity === "red");
  const fpmateBad = row.compact_health.fpmate_reachable === false;
  if (hasRed || fpmateBad || row.status === "degraded") return "attenzione";
  if (row.warnings.length > 0) return "attenzione";
  return "operativo";
}

export function fiscalCassaStatusLabel(status: FiscalCassaStatus): string {
  switch (status) {
    case "operativo":
      return "Operativo";
    case "attenzione":
      return "Attenzione";
    case "offline":
      return "Offline";
  }
}

export function fiscalCassaStatusHint(status: FiscalCassaStatus): string {
  switch (status) {
    case "operativo":
      return "La cassa fiscale comunica regolarmente con il sistema.";
    case "attenzione":
      return "Qualcosa richiede un controllo: vedi i punti sotto.";
    case "offline":
      return "Il PC cassa non risponde o non invia aggiornamenti.";
  }
}

export function humanProblemsFromRow(row: BridgeDashboardEnrichedRow): HumanProblem[] {
  const out: HumanProblem[] = [];
  const seen = new Set<string>();

  for (const w of row.warnings) {
    if (seen.has(w.code)) continue;
    seen.add(w.code);
    const h = WARNING_HUMAN[w.code];
    out.push({
      code: w.code,
      title: h?.title ?? w.message,
      detail: h?.detail ?? w.message,
      tone: w.severity,
    });
  }

  const snap = row.fiscal_snapshot;
  if (snap) {
    if (snap.counts.failed > 0 && !seen.has("failed_jobs")) {
      seen.add("failed_jobs");
      out.push({
        code: "failed_jobs",
        title: WARNING_HUMAN.failed_jobs.title,
        detail: `${snap.counts.failed} documento/i segnati come falliti.`,
        tone: "red",
      });
    }
    if (snap.counts.reconcile_required > 0 && !seen.has("reconcile_required")) {
      seen.add("reconcile_required");
      out.push({
        code: "reconcile_required",
        title: WARNING_HUMAN.reconcile_required.title,
        detail: `${snap.counts.reconcile_required} richiedono verifica stampante.`,
        tone: "red",
      });
    }
    if (snap.counts.processing > 0 && !seen.has("processing_active")) {
      const stale = snap.critical_jobs.some((j) => j.category === "processing_stale");
      if (stale && !seen.has("processing_stuck")) {
        seen.add("processing_stuck");
        out.push({
          code: "processing_stuck",
          title: WARNING_HUMAN.processing_stuck.title,
          detail: WARNING_HUMAN.processing_stuck.detail,
          tone: "red",
        });
      }
    }
  }

  return out;
}

export function printerStatusLabel(reachable: boolean | null): {
  label: string;
  ok: boolean | null;
  hint: string;
} {
  if (reachable === true) {
    return {
      label: "Raggiungibile",
      ok: true,
      hint: "FPMate risponde: la stampante è pronta a emettere documenti.",
    };
  }
  if (reachable === false) {
    return {
      label: "Non raggiungibile",
      ok: false,
      hint: "La cassa non riesce a parlare con la stampante. Controllare cavo/rete e accensione.",
    };
  }
  return {
    label: "Stato sconosciuto",
    ok: null,
    hint: "Non abbiamo ancora un controllo recente sulla stampante.",
  };
}

export function formatJobActivity(
  job: BridgeLastJobSummary | null,
  emptyLabel: string,
): { primary: string; secondary: string | null } {
  if (!job) {
    return { primary: emptyLabel, secondary: null };
  }
  const when = job.completed_at ?? job.created_at;
  const statusIt =
    job.status === "completed"
      ? "Completato"
      : job.status === "failed"
        ? "Fallito"
        : job.status === "processing"
          ? "In elaborazione"
          : job.status === "pending"
            ? "In attesa"
            : job.status;
  return {
    primary: statusIt,
    secondary: when ? when : null,
  };
}

export function extractTechnicalHealth(health: Record<string, unknown>): {
  node_version: string | null;
  hostname: string | null;
  journal_path: string | null;
  queue_raw: Record<string, unknown> | null;
} {
  return {
    node_version:
      typeof health.node_version === "string" ? health.node_version : null,
    hostname: typeof health.hostname === "string" ? health.hostname : null,
    journal_path:
      typeof health.journal_path === "string" ? health.journal_path : null,
    queue_raw:
      health.queue != null && typeof health.queue === "object" && !Array.isArray(health.queue)
        ? (health.queue as Record<string, unknown>)
        : {
            pending: health.queue_pending,
            processing: health.queue_processing,
            failed: health.queue_failed,
            reconcile_required: health.reconcile_required,
          },
  };
}
