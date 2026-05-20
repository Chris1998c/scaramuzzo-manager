import { createHash } from "node:crypto";

/** Allineato a public.ledger_movement_group_from_text (SQL md5). */
export function ledgerMovementGroupFromText(label: string): string {
  const hex = createHash("md5").update(`scz-ledger:${label}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "5" + hex.slice(13, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export const BOSS_BASELINE_MOVEMENT_GROUP_ID = ledgerMovementGroupFromText(
  "boss_import_baseline_bulk",
);

export function movementGroupFromSaleId(saleId: number): string {
  return ledgerMovementGroupFromText(`sale:${saleId}`);
}

export function movementGroupFromTransferId(transferId: number): string {
  return ledgerMovementGroupFromText(`transfer:${transferId}`);
}

export type StockLedgerRpcFields = {
  p_sale_id?: number | null;
  p_transfer_id?: number | null;
  p_sale_item_id?: number | null;
  p_transfer_item_id?: number | null;
  p_created_by?: string | null;
  p_movement_group_id?: string | null;
  p_source?: string | null;
};
