export type MovementReasonLinks = {
  saleId: number | null;
  transferId: number | null;
};

/** Estrae link da reason ledger (es. Vendita #42, transfer_id=7). */
export function parseMovementReasonLinks(
  reason: string | null | undefined,
): MovementReasonLinks {
  const r = String(reason ?? "");
  let saleId: number | null = null;
  let transferId: number | null = null;

  const saleMatch = r.match(/Vendita\s*#(\d+)/i);
  if (saleMatch) {
    const n = Number(saleMatch[1]);
    if (Number.isFinite(n)) saleId = n;
  }

  const transferMatch = r.match(/transfer_id\s*=\s*(\d+)/i);
  if (transferMatch) {
    const n = Number(transferMatch[1]);
    if (Number.isFinite(n)) transferId = n;
  }

  return { saleId, transferId };
}
