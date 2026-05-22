const SECRET_KEY_RE =
  /secret|token|password|service.?role|authorization|bearer|apikey|supabase/i;
const PII_KEY_RE = /customer|cliente|nome|name|email|phone|telefono/i;

function sanitizeValue(key: string, value: unknown): unknown {
  if (value == null) return value;
  if (SECRET_KEY_RE.test(key)) return "[redacted]";
  if (PII_KEY_RE.test(key)) return "[redacted-pii]";
  if (typeof value === "string") {
    if (value.length > 4000) return `${value.slice(0, 4000)}…`;
    if (/^eyJ[A-Za-z0-9_-]+\./.test(value)) return "[redacted-jwt]";
    if (/Bearer\s+/i.test(value)) return "[redacted]";
  }
  return value;
}

function walk(obj: unknown, depth = 0): unknown {
  if (depth > 10) return "[max-depth]";
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => walk(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) continue;
    if (v && typeof v === "object") {
      out[k] = walk(v, depth + 1);
    } else {
      out[k] = sanitizeValue(k, v);
    }
  }
  return out;
}

export type BridgeHeartbeatInput = {
  [key: string]: unknown;
  bridge_id?: string;
  salon_id?: number;
  version?: string;
  online?: boolean;
  worker_enabled?: boolean;
  uptime_sec?: number;
  uptime_seconds?: number;
  node_version?: string;
  hostname?: string;
  checks?: {
    config_valid?: boolean;
    supabase_reachable?: boolean;
    fpmate_reachable?: boolean;
  };
  supabase_reachable?: boolean;
  fpmate_reachable?: boolean;
  queue?: {
    pending?: number | null;
    processing?: number | null;
    failed?: number | null;
  };
  queue_pending?: number | null;
  queue_processing?: number | null;
  queue_failed?: number | null;
  reconcile_required?: number | null;
  last_job?: Record<string, unknown> | null;
  last_job_status?: string | null;
  last_local_job?: Record<string, unknown> | null;
  journal_path?: string | null;
  last_error?: string | null;
};

/** Normalizza payload bridge → JSON sicuro per last_health. */
export function normalizeAndSanitizeHeartbeatPayload(
  raw: BridgeHeartbeatInput,
): Record<string, unknown> {
  const checks = raw.checks ?? {};
  const pending =
    raw.queue_pending ??
    raw.queue?.pending ??
    null;
  const processing =
    raw.queue_processing ??
    raw.queue?.processing ??
    null;
  const failed =
    raw.queue_failed ??
    (raw.queue as { failed?: number } | undefined)?.failed ??
    null;
  const reconcileRequired = raw.reconcile_required ?? null;

  const normalized: Record<string, unknown> = {
    bridge_id: raw.bridge_id ?? null,
    salon_id: raw.salon_id ?? null,
    version: raw.version ?? null,
    online: raw.online !== false,
    worker_enabled: raw.worker_enabled === true,
    uptime_seconds: raw.uptime_seconds ?? raw.uptime_sec ?? null,
    node_version: raw.node_version ?? null,
    hostname: raw.hostname ?? null,
    supabase_reachable:
      raw.supabase_reachable ?? checks.supabase_reachable ?? null,
    fpmate_reachable: raw.fpmate_reachable ?? checks.fpmate_reachable ?? null,
    config_valid: checks.config_valid ?? null,
    queue_pending: pending,
    queue_processing: processing,
    queue_failed: failed,
    reconcile_required: reconcileRequired,
    last_job: raw.last_job ?? null,
    last_job_status:
      raw.last_job_status ??
      (raw.last_job && typeof raw.last_job === "object"
        ? String((raw.last_job as { status?: string }).status ?? "") || null
        : null),
    last_local_job: raw.last_local_job ?? null,
    journal_path: raw.journal_path ?? null,
    last_error: raw.last_error ?? null,
    received_at: new Date().toISOString(),
  };

  return walk(normalized) as Record<string, unknown>;
}

/** Per test: il JSON serializzato non deve contenere pattern segreto. */
export function serializedHealthHasNoSecrets(json: string): boolean {
  const banned = [
    /service_role_key/i,
    /SUPABASE_SERVICE_ROLE/i,
    /PRINT_BRIDGE_TOKEN=/i,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/,
  ];
  return !banned.some((re) => re.test(json));
}
