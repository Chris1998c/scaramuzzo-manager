export const CASSA_STOCK_INSUFFICIENT_CODE = "STOCK_INSUFFICIENT" as const;

export type CassaStockErrorPayload = {
  code: typeof CASSA_STOCK_INSUFFICIENT_CODE;
  status: 409;
  message: string;
  productId: number | null;
};

/** Mappa errori RPC close_sale_atomic / stock_move legati a giacenza. */
export function mapCassaStockRpcError(
  raw: string | undefined | null,
): CassaStockErrorPayload | null {
  if (!raw) return null;
  const msg = raw.trim();
  const lower = msg.toLowerCase();

  const isStockError =
    lower.includes("giacenza insufficiente") ||
    lower.includes("negative stock not allowed") ||
    lower.includes("negative stock");

  if (!isStockError) return null;

  let productId: number | null = null;
  const mIt = msg.match(/prodotto\s+(\d+)/i);
  const mEn = msg.match(/product\s+(\d+)/i);
  if (mIt) productId = Number(mIt[1]);
  else if (mEn) productId = Number(mEn[1]);
  if (productId != null && !Number.isFinite(productId)) productId = null;

  const message =
    productId != null
      ? `Giacenza insufficiente per il prodotto #${productId}. Aggiorna il magazzino o rimuovi il prodotto dal carrello.`
      : "Giacenza insufficiente. Aggiorna il magazzino o rimuovi il prodotto dal carrello.";

  return {
    code: CASSA_STOCK_INSUFFICIENT_CODE,
    status: 409,
    message,
    productId,
  };
}

/** Messaggio UX arricchito con nome prodotto dal carrello (se disponibile). */
export function formatCassaStockInsufficientMessage(args: {
  productId: number | null;
  productName?: string | null;
}): string {
  const name = args.productName?.trim();
  if (name) {
    return `Giacenza insufficiente per ${name}. Aggiorna il magazzino o rimuovi il prodotto dal carrello.`;
  }
  if (args.productId != null) {
    return `Giacenza insufficiente per il prodotto #${args.productId}. Aggiorna il magazzino o rimuovi il prodotto dal carrello.`;
  }
  return "Giacenza insufficiente. Aggiorna il magazzino o rimuovi il prodotto dal carrello.";
}
