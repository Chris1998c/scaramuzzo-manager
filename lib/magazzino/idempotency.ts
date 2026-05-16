import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CLIENT_REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseClientRequestId(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s || !CLIENT_REQUEST_ID_RE.test(s)) return null;
  return s;
}

export function requireClientRequestIdResponse(v: unknown) {
  const id = parseClientRequestId(v);
  if (id) return { id };
  return NextResponse.json(
    { error: "request_id mancante o non valido (UUID richiesto)" },
    { status: 400 }
  );
}

export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

export function idempotentMovementResponse(movementId: number) {
  return NextResponse.json(
    { ok: true, idempotent: true, duplicate_movement_id: movementId },
    { status: 200 }
  );
}

export function idempotentTransferResponse(transferId: number) {
  return NextResponse.json(
    { ok: true, idempotent: true, transfer_id: transferId },
    { status: 200 }
  );
}

export async function findStockMovementByClientRequestId(
  clientRequestId: string
): Promise<{ id: number } | null> {
  const { data, error } = await supabaseAdmin
    .from("stock_movements")
    .select("id")
    .eq("client_request_id", clientRequestId)
    .maybeSingle();

  if (error || !data) return null;
  return { id: Number((data as { id: number }).id) };
}

type TransferRow = {
  id: number;
  status: string;
  executed_at: string | null;
};

/** Payload RPC stock_move (7 parametri espliciti — evita overload 6 vs 7 arg in PostgREST). */
export type StockMoveRpcInput = {
  p_product_id: number;
  p_qty: number;
  p_from_salon: number | null;
  p_to_salon: number | null;
  p_movement_type: string;
  p_reason: string | null;
};

export function stockMoveRpc(
  params: StockMoveRpcInput & { p_client_request_id?: string | null }
) {
  return {
    p_product_id: params.p_product_id,
    p_qty: params.p_qty,
    p_from_salon: params.p_from_salon,
    p_to_salon: params.p_to_salon,
    p_movement_type: params.p_movement_type,
    p_reason: params.p_reason,
    p_client_request_id: params.p_client_request_id ?? null,
  };
}

export async function findTransferByClientRequestId(
  clientRequestId: string
): Promise<TransferRow | null> {
  const { data, error } = await supabaseAdmin
    .from("transfers")
    .select("id, status, executed_at")
    .eq("client_request_id", clientRequestId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as TransferRow;
  return {
    id: Number(row.id),
    status: String(row.status),
    executed_at: row.executed_at ?? null,
  };
}

export async function runStockMoveIdempotent(args: {
  clientRequestId: string;
  rpc: StockMoveRpcInput;
}): Promise<
  | { ok: true; idempotent?: boolean; duplicate_movement_id?: number }
  | { error: string }
> {
  const existing = await findStockMovementByClientRequestId(args.clientRequestId);
  if (existing) {
    return { ok: true, idempotent: true, duplicate_movement_id: existing.id };
  }

  const { error } = await supabaseAdmin.rpc(
    "stock_move",
    stockMoveRpc({ ...args.rpc, p_client_request_id: args.clientRequestId })
  );

  if (!error) {
    return { ok: true };
  }

  if (isUniqueViolation(error)) {
    const dup = await findStockMovementByClientRequestId(args.clientRequestId);
    if (dup) {
      return { ok: true, idempotent: true, duplicate_movement_id: dup.id };
    }
  }

  return { error: error.message };
}

/** Replay transfer: se executeNow e non ancora eseguito, chiama execute_transfer (già replay-safe). */
export async function resolveTransferIdempotent(args: {
  clientRequestId: string;
  executeNow: boolean;
  actorId: string;
}): Promise<{ transfer_id: number } | null> {
  const row = await findTransferByClientRequestId(args.clientRequestId);
  if (!row) return null;

  const executed =
    row.executed_at != null || row.status === "executed";

  if (args.executeNow && !executed) {
    if (row.status !== "ready") {
      await supabaseAdmin
        .from("transfers")
        .update({ status: "ready" })
        .eq("id", row.id);
    }

    const { error: execError } = await supabaseAdmin.rpc("execute_transfer", {
      p_transfer_id: row.id,
      p_actor_id: args.actorId,
    });

    if (execError) {
      const after = await findTransferByClientRequestId(args.clientRequestId);
      const done =
        after?.executed_at != null || after?.status === "executed";
      if (!done) {
        return null;
      }
    }
  }

  return { transfer_id: row.id };
}
