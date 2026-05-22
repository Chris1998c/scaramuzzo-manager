export type BridgeRunbookEntry = {
  code: string;
  title: string;
  steps: string[];
};

export const BRIDGE_RUNBOOK_ENTRIES: BridgeRunbookEntry[] = [
  {
    code: "bridge_offline",
    title: "Bridge offline",
    steps: [
      "Verificare che il PC cassa sia acceso e collegato alla rete del salone.",
      "Controllare che il servizio Windows Print Bridge sia in esecuzione.",
      "Verificare firewall locale e reachability verso il Manager.",
      "Dopo ripristino, attendere un heartbeat entro 2 minuti.",
    ],
  },
  {
    code: "fpmate_unreachable",
    title: "FPMate offline",
    steps: [
      "Controllare IP/host della stampante fiscale in configurazione bridge.",
      "Verificare rete LAN del salone (ping verso stampante).",
      "Riavviare FPMate / servizio stampante se necessario.",
      "Non forzare requeue scontrini finché FPMate non risponde.",
    ],
  },
  {
    code: "reconcile_required",
    title: "Riconciliazione richiesta",
    steps: [
      "Verificare fisicamente sulla stampante se il documento è uscito.",
      "Confrontare numero scontrino / Z con il job in Manager.",
      "Solo dopo verifica: annullare o requeue guidato dal coordinator.",
      "Non usare requeue automatico su sale_receipt/void se lo SOAP potrebbe essere partito.",
    ],
  },
  {
    code: "failed_jobs",
    title: "Job falliti",
    steps: [
      "Aprire il dettaglio job e leggere error_message.",
      "Se bridge online e FPMate OK, valutare requeue manuale (solo failed).",
      "Per errori ripetuti, controllare journal bridge sul PC.",
    ],
  },
  {
    code: "processing_stuck",
    title: "Processing bloccato",
    steps: [
      "Attendere almeno 5 minuti se la stampante sta elaborando.",
      "Verificare FPMate e coda locale sul PC bridge.",
      "Se bloccato oltre soglia: annulla job solo dopo verifica stampante (coordinator).",
    ],
  },
  {
    code: "z_report_missing_today",
    title: "Z report non eseguito oggi",
    steps: [
      "Controllare se la chiusura giornaliera è già stata stampata sulla fiscale.",
      "Verificare job z_report in coda o falliti.",
      "Eseguire Z solo a sessione cassa chiusa correttamente.",
    ],
  },
  {
    code: "pending_stuck",
    title: "Coda pending troppo lunga",
    steps: [
      "Verificare bridge online e worker abilitato.",
      "Controllare errori in last_error del heartbeat.",
      "Svuotare eventuali blocchi FPMate prima di requeue massivo.",
    ],
  },
];

export function runbookForCodes(codes: string[]): BridgeRunbookEntry[] {
  const set = new Set(codes);
  return BRIDGE_RUNBOOK_ENTRIES.filter((e) => set.has(e.code));
}
