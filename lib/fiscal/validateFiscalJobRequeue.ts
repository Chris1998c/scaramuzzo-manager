import type { FiscalPrintJobActionRecord } from "@/lib/fiscal/fetchFiscalPrintJobById";

export function validateRequeueFiscalJob(
  job: FiscalPrintJobActionRecord,
  opts: { confirmZReport: boolean },
): { ok: true; force: boolean } | { ok: false; status: number; message: string } {
  const status = job.status.toLowerCase();

  if (status === "completed") {
    return {
      ok: false,
      status: 409,
      message: "I job completed non possono essere rimessi in coda.",
    };
  }

  if (status === "cancelled") {
    return {
      ok: false,
      status: 409,
      message: "I job annullati non possono essere rimessi in coda.",
    };
  }

  if (status === "pending") {
    return {
      ok: false,
      status: 409,
      message: "Job già in coda: rimessa in coda non necessaria.",
    };
  }

  if (job.kind === "z_report" && !opts.confirmZReport) {
    return {
      ok: false,
      status: 400,
      message:
        "Per rimettere in coda una chiusura Z conferma esplicitamente l’operazione.",
    };
  }

  if (status === "failed") {
    return { ok: true, force: false };
  }

  if (status === "processing") {
    return {
      ok: false,
      status: 409,
      message:
        "Stampa in corso o bloccata: usa Annulla dalla dashboard oppure contatta l’assistenza. Non ristampare senza verifica.",
    };
  }

  return {
    ok: false,
    status: 409,
    message: `Rimessa in coda non consentita per stato "${job.status}".`,
  };
}
