/** Risultato JSON di public.stock_move (RPC). */
export type StockMoveRpcResult = {
  ok?: boolean;
  idempotent?: boolean;
  movement_id?: number;
  product_id?: number;
  movement_type?: string;
};

export function parseStockMoveRpcResult(data: unknown): StockMoveRpcResult | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const movementId = d.movement_id != null ? Number(d.movement_id) : undefined;
  return {
    ok: d.ok === true,
    idempotent: d.idempotent === true,
    movement_id: Number.isFinite(movementId) ? movementId : undefined,
    product_id: d.product_id != null ? Number(d.product_id) : undefined,
    movement_type:
      d.movement_type != null ? String(d.movement_type) : undefined,
  };
}

export const MOVIMENTI_PAGE_SIZE = 50;

export function movimentiRange(page: number, pageSize = MOVIMENTI_PAGE_SIZE): {
  from: number;
  to: number;
} {
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const from = (p - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function totalPages(totalCount: number, pageSize = MOVIMENTI_PAGE_SIZE): number {
  if (!Number.isFinite(totalCount) || totalCount <= 0) return 1;
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
