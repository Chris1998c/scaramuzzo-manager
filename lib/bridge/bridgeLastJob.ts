import { coerceClaimInt, toJsonSafeValue } from "@/lib/bridge/bridgeClaimRpc";

export type BridgeLastJobResponse = {
  id: number;
  kind: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  processed_at: string | null;
  locked_at: string | null;
  locked_by: string | null;
  sale_id: number | null;
  error_message: string | null;
};

function pickIso(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

/** Serializza riga fiscal_print_jobs per GET /api/bridge/jobs/last (JSON-safe). */
export function serializeBridgeLastJob(
  raw: Record<string, unknown> | null,
): BridgeLastJobResponse | null {
  if (!raw) return null;

  const id = coerceClaimInt(raw.id);
  const salonId = coerceClaimInt(raw.salon_id);
  if (id == null || salonId == null) return null;

  const kind = String(raw.kind ?? "").trim();
  const status = String(raw.status ?? "").trim();
  const createdAt = pickIso(raw.created_at);
  if (!kind || !status || !createdAt) return null;

  const err = raw.error_message;
  return {
    id,
    kind,
    status,
    created_at: createdAt,
    completed_at: pickIso(raw.completed_at),
    processed_at: pickIso(raw.processed_at),
    locked_at: pickIso(raw.locked_at),
    locked_by: raw.locked_by != null ? String(raw.locked_by) : null,
    sale_id: coerceClaimInt(raw.sale_id),
    error_message:
      typeof err === "string" && err.trim() ? err.trim() : err != null ? String(err) : null,
  };
}

/** Verifica che la risposta sia serializzabile (BigInt già coerced su id). */
export function bridgeLastJobToJson(job: BridgeLastJobResponse | null): BridgeLastJobResponse | null {
  if (!job) return null;
  return toJsonSafeValue(job) as BridgeLastJobResponse;
}
