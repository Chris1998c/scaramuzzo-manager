export type CreateTransferRpcResult = {
  ok?: boolean;
  idempotent?: boolean;
  transfer_id?: number;
};

export function parseCreateTransferRpcResult(data: unknown): CreateTransferRpcResult | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const tid = d.transfer_id != null ? Number(d.transfer_id) : undefined;
  return {
    ok: d.ok === true,
    idempotent: d.idempotent === true,
    transfer_id: Number.isFinite(tid) ? tid : undefined,
  };
}
