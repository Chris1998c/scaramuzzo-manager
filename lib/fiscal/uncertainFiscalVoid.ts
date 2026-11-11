import type { VoidVoidJobInfo } from "@/lib/fiscal/fiscalDocumentTypes";

export type UncertainFiscalVoidOutcome = "void_printed" | "void_not_printed";

/** Vendita bloccata in fiscal_void_pending senza void ancora attivo → da verificare su Epson. */
export function isUncertainFiscalVoid(args: {
  saleStatus: string | null | undefined;
  voidVoidJob: VoidVoidJobInfo | null | undefined;
  latestCancelledVoidJobId?: number | null;
}): boolean {
  const sale = String(args.saleStatus ?? "")
    .toLowerCase()
    .trim();
  if (sale !== "fiscal_void_pending") return false;
  if (args.voidVoidJob) return false; // pending/processing/completed ancora “vivo”
  return args.latestCancelledVoidJobId != null && args.latestCancelledVoidJobId > 0;
}

export function uncertainFiscalVoidBannerCopy(): {
  title: string;
  detail: string;
} {
  return {
    title: "Esito fiscale da verificare",
    detail:
      "L’annullo era in elaborazione sulla stampante e il job è stato cancellato. Controlla sulla Epson se lo scontrino di annullo è uscito, poi conferma l’esito qui. Non viene reinviato alcun void automaticamente.",
  };
}
