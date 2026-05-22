/** Normalizza risposta RPC claim_fiscal_print_jobs (array | oggetto | null). */

export type ClaimRpcRow = {
  id: number;
  kind: string;
  payload: unknown;
  attempts: number;
  created_at: string;
  sale_id: number | null;
  salon_id: number;
  status?: string;
  locked_by?: string | null;
  locked_at?: string | null;
};

export function coerceClaimInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

/** Valori JSON-safe per NextResponse (BigInt, Date, undefined). */
export function toJsonSafeValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[max-depth]";
  if (value == null) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => toJsonSafeValue(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = toJsonSafeValue(v, depth + 1);
  }
  return out;
}

export function parseClaimRpcRow(raw: unknown): ClaimRpcRow | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const id = coerceClaimInt(r.id);
  const salonId = coerceClaimInt(r.salon_id);
  if (id == null || salonId == null) return null;

  const kind = String(r.kind ?? "").trim();
  if (!kind) return null;

  const createdAt = r.created_at != null ? String(r.created_at) : null;
  if (!createdAt) return null;

  return {
    id,
    kind,
    payload: toJsonSafeValue(r.payload ?? null),
    attempts: coerceClaimInt(r.attempts) ?? 0,
    created_at: createdAt,
    sale_id: coerceClaimInt(r.sale_id),
    salon_id: salonId,
    status: r.status != null ? String(r.status) : undefined,
    locked_by: r.locked_by != null ? String(r.locked_by) : null,
    locked_at: r.locked_at != null ? String(r.locked_at) : null,
  };
}

export function normalizeClaimRpcRows(data: unknown): ClaimRpcRow[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.map(parseClaimRpcRow).filter((r): r is ClaimRpcRow => r != null);
  }
  const one = parseClaimRpcRow(data);
  return one ? [one] : [];
}

export type ClaimRpcErrorMapping = { status: number; error: string };

/** Mappa errori PostgREST / Postgres noti su claim. */
export function mapClaimRpcError(message: string, code?: string): ClaimRpcErrorMapping {
  const msg = message.toLowerCase();

  if (code === "PGRST202" || /could not find the function/i.test(message)) {
    return { status: 503, error: "claim_rpc_not_available" };
  }
  if (/claim_fiscal_print_jobs.*p_bridge_id/i.test(msg)) {
    return { status: 400, error: "bridge_id_required" };
  }
  if (/p_limit deve essere/i.test(msg)) {
    return { status: 400, error: "claim_limit_invalid" };
  }
  if (/permission denied|42501/i.test(msg)) {
    return { status: 503, error: "claim_permission_denied" };
  }

  return { status: 500, error: "claim_failed" };
}
