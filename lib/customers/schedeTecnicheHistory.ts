import { movimentiRange } from "@/lib/magazzino/stockMoveResult";

/** Prima pagina storico schede (moderne + legacy); “Carica altri” riusa lo stesso page size. */
export const SCHEDE_HISTORY_PAGE_SIZE = 20;

export function schedeHistoryRange(page: number, pageSize = SCHEDE_HISTORY_PAGE_SIZE) {
  return movimentiRange(page, pageSize);
}

export function schedeHistoryHasMore(loadedCount: number, pageSize = SCHEDE_HISTORY_PAGE_SIZE) {
  return loadedCount > 0 && loadedCount % pageSize === 0;
}
