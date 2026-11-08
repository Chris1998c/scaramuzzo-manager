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
      message:
        "Rimessa in coda non supportata per job annullati (manca RPC dedicata).",
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
        "Conferma esplicita richiesta per rimettere in coda un job Z-REPORT (confirm_z_report).",
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
        "Per una stampa bloccata usa Annulla dalla dashboard; la rimessa in coda in processing è solo via RPC con force (non esposta).",
    };
  }

  return {
    ok: false,
    status: 409,
    message: `Rimessa in coda non consentita per stato "${job.status}".`,
  };
}
