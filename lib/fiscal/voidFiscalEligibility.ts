import type { FiscalDocumentView } from "@/lib/fiscal/fiscalDocumentTypes";

export type VoidVoidJobInfo = {
  job_id: number;
  status: string;
} | null;

function hasText(v: string | null | undefined): boolean {
  return v != null && String(v).trim() !== "";
}

function hasVoidCoordinates(doc: FiscalDocumentView | null): boolean {
  if (!doc) return false;
  return (
    hasText(doc.fiscal_receipt_number) &&
    hasText(doc.z_rep_number) &&
    hasText(doc.fiscal_receipt_date) &&
    hasText(doc.printer_serial)
  );
}

export function computeVoidFiscalEligibility(args: {
  isCoordinator: boolean;
  fiscalStatus: string | null;
  saleStatus: string | null;
  document: FiscalDocumentView | null;
  voidVoidJob: VoidVoidJobInfo;
}): { canVoid: boolean; reason: string | null } {
  if (!args.isCoordinator) {
    return { canVoid: false, reason: "Solo il coordinator può annullare fiscalmente" };
  }

  const fiscal = String(args.fiscalStatus ?? "").toLowerCase().trim();
  const sale = String(args.saleStatus ?? "").toLowerCase().trim();
  const docType = String(args.document?.document_type ?? "").toLowerCase().trim();

  if (args.voidVoidJob) {
    const st = String(args.voidVoidJob.status).toLowerCase().trim();
    return {
      canVoid: false,
      reason: `Annullo fiscale già presente (${st}, job #${args.voidVoidJob.job_id})`,
    };
  }

  if (sale === "fiscal_void_pending") {
    return { canVoid: false, reason: "Annullo fiscale già in corso" };
  }

  if (fiscal !== "printed") {
    return {
      canVoid: false,
      reason: "Disponibile solo per vendite con scontrino stampato",
    };
  }

  if (sale !== "posted") {
    return {
      canVoid: false,
      reason: `Vendita non annullabile (stato: ${sale || "—"})`,
    };
  }

  if (docType !== "sale_receipt") {
    return {
      canVoid: false,
      reason: "Documento fiscale di vendita non disponibile",
    };
  }

  if (!hasVoidCoordinates(args.document)) {
    return {
      canVoid: false,
      reason: "Coordinate fiscali incomplete per l’annullo",
    };
  }

  return { canVoid: true, reason: null };
}
