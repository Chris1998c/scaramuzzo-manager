/** Testo toast dopo /api/cassa/close (nessuna stampa su DB). */

export function cassaCloseSuccessToast(input: {
  warning?: string | null;
  fiscalPrintJobId?: number | null;
  printerEnabled?: boolean | null;
}): { title: string; description: string; tone: "success" | "warning" } {
  if (input.warning) {
    return {
      title: "Vendita registrata",
      description: String(input.warning),
      tone: "warning",
    };
  }

  if (input.fiscalPrintJobId != null && Number.isFinite(input.fiscalPrintJobId)) {
    return {
      title: "Vendita registrata",
      description: `Stampa fiscale in coda (job n. ${input.fiscalPrintJobId}). Il Print Bridge locale elabora la coda verso Epson FP81 RT; lo stato si aggiorna al callback.`,
      tone: "success",
    };
  }

  if (input.printerEnabled === false) {
    return {
      title: "Vendita registrata",
      description:
        "Vendita salvata senza stampa fiscale: stampante disattivata per questa sessione di cassa.",
      tone: "success",
    };
  }

  return {
    title: "Vendita registrata",
    description: "Vendita salvata. Nessuna stampa fiscale accodata.",
    tone: "success",
  };
}
