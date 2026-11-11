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
      "L’annullo era in elaborazione e il job è stato cancellato. Verifica sulla Epson (memoria fiscale / registrazioni / elenco documenti), non solo se manca la carta. Conferma «annullo stampato» o «annullo non stampato» solo con esito certo. Se resta incerto lascia il caso bloccato e coinvolgi il tecnico della cassa. Non viene reinviato alcun void automaticamente.",
  };
}

export function uncertainFiscalVoidModalCopy(): {
  intro: string;
  notPrintedLabel: string;
  printedLabel: string;
  uncertainHint: string;
} {
  return {
    intro:
      "Nessun comando viene inviato alla stampante. Controlla nei dati Epson (non solo la carta) se esiste il documento di annullo, poi scegli l’esito solo se sei certo.",
    notPrintedLabel:
      "Annullo non stampato (assenza documento nelle registrazioni Epson) → ripristina vendita, nessuno storno stock",
    printedLabel:
      "Annullo stampato (documento trovato sulle registrazioni Epson) → chiudi come voided e storna stock (coordinate obbligatorie)",
    uncertainHint:
      "Esito ancora incerto? Non confermare: lascia il caso bloccato e chiama il tecnico della cassa.",
  };
}
