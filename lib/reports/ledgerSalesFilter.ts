/**
 * Filtro ledger per fatturato/incassi normali nei report.
 * Non usa fiscal_status: vendite not_required restano incluse se posted+sale.
 */
export const SALES_LEDGER_STATUS = "posted" as const;
export const SALES_LEDGER_OPERATION_TYPE = "sale" as const;
