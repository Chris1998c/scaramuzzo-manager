/**
 * Normalizza il body del callback Print Bridge nello shape atteso da
 * finalize_fiscal_job_atomic / fiscal_documents (allineato al worker bridge).
 */
export const FISCAL_RESULT_TAGS = [
  "fiscalReceiptNumber",
  "fiscalReceiptAmount",
  "fiscalReceiptDate",
  "fiscalReceiptTime",
  "receiptISODateTime",
  "zRepNumber",
  "serialNumber",
] as const;

export type FiscalResultTag = (typeof FISCAL_RESULT_TAGS)[number];

export type FinalizeFiscalResultPayload = {
  responseXml: string | null;
  parsed: Record<string, unknown> | null;
} & Partial<Record<FiscalResultTag, string | null>>;

const XML_KEYS = [
  "responseXml",
  "response_xml",
  "xml",
  "rawXml",
  "raw_xml",
  "soapResponse",
  "soap_response",
] as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function pickString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string") {
      const t = c.trim();
      if (t) return t;
    }
    if (typeof c === "number" && Number.isFinite(c)) {
      return String(c);
    }
  }
  return null;
}

function collectSources(body: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();

  const push = (v: unknown) => {
    const r = asRecord(v);
    if (r && !seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  };

  push(body);
  push(body.result);
  push(body.parsed);
  push(body.data);
  push(body.fiscal);
  push(body.payload);

  const result = asRecord(body.result);
  if (result) {
    push(result.parsed);
    push(result.data);
    push(result.fiscal);
  }

  return out;
}

function pickResponseXml(
  body: Record<string, unknown>,
  sources: Record<string, unknown>[],
): string | null {
  const candidates: unknown[] = [];

  for (const src of [body, ...sources]) {
    for (const key of XML_KEYS) {
      candidates.push(src[key]);
    }
  }

  if (typeof body.result === "string") {
    const t = body.result.trim();
    if (t.startsWith("<")) candidates.push(t);
  }

  return pickString(...candidates);
}

function pickTag(
  tag: FiscalResultTag,
  sources: Record<string, unknown>[],
): string | null {
  const snake = tag.replace(/([A-Z])/g, "_$1").toLowerCase();
  const candidates: unknown[] = [];

  for (const src of sources) {
    candidates.push(src[tag], src[snake]);
    const parsed = asRecord(src.parsed);
    if (parsed) {
      candidates.push(parsed[tag], parsed[snake]);
    }
  }

  return pickString(...candidates);
}

/**
 * Costruisce p_result per finalize_fiscal_job_atomic dal body callback.
 */
export function buildFinalizeResult(
  body: Record<string, unknown> | null | undefined,
): FinalizeFiscalResultPayload {
  if (!body) {
    return { responseXml: null, parsed: null };
  }

  const sources = collectSources(body);
  const responseXml = pickResponseXml(body, sources);

  const parsed: Record<string, unknown> = {};
  for (const src of sources) {
    const p = asRecord(src.parsed);
    if (p) Object.assign(parsed, p);
  }

  const out: FinalizeFiscalResultPayload = {
    responseXml,
    parsed: null,
  };

  for (const tag of FISCAL_RESULT_TAGS) {
    const value = pickTag(tag, sources);
    if (value != null) {
      out[tag] = value;
      parsed[tag] = value;
    }
  }

  out.parsed = Object.keys(parsed).length > 0 ? parsed : null;

  // Conserva campi extra del payload bridge (es. metadati) senza sovrascrivere i canonici.
  const resultObj = asRecord(body.result);
  if (resultObj) {
    for (const [k, v] of Object.entries(resultObj)) {
      if (
        k === "parsed" ||
        k === "responseXml" ||
        FISCAL_RESULT_TAGS.includes(k as FiscalResultTag)
      ) {
        continue;
      }
      if (!(k in out)) {
        (out as Record<string, unknown>)[k] = v;
      }
    }
  }

  return out;
}

/** bridge_id / locked_by inviato dal worker per ownership check RPC. */
export function readBridgeIdFromCallback(
  body: Record<string, unknown> | null | undefined,
  headers?: Headers,
): string | null {
  const headerId =
    headers?.get("x-bridge-id")?.trim() ||
    headers?.get("x-fiscal-bridge-id")?.trim() ||
    null;

  if (!body) return headerId;

  const sources = collectSources(body);
  const fromBody = pickString(
    body.bridge_id,
    body.bridgeId,
    body.p_bridge_id,
    body.locked_by,
    ...sources.flatMap((s) => [s.bridge_id, s.bridgeId, s.p_bridge_id, s.locked_by]),
  );

  return fromBody ?? headerId;
}
