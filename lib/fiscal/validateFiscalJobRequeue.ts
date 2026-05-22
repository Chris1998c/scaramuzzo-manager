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
        "Requeue non supportato per job cancelled (manca RPC domain-aware).",
    };
  }

  if (status === "pending") {
    return {
      ok: false,
      status: 409,
      message: "Job già pending: requeue non necessario.",
    };
  }

  if (job.kind === "z_report" && !opts.confirmZReport) {
    return {
      ok: false,
      status: 400,
      message:
        "Conferma esplicita richiesta per requeue di job z_report (confirm_z_report).",
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
        "Per processing bloccato usa Annulla dalla dashboard; requeue processing solo via RPC con force (non esposto).",
    };
  }

  return {
    ok: false,
    status: 409,
    message: `Requeue non consentito per stato "${job.status}".`,
  };
}
