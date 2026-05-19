import "server-only";

export type PrintBridgeHealthProbe = {
  online: boolean;
  responseTimeMs: number | null;
  checkedAt: string;
  error: string | null;
  configured: boolean;
};

const DEFAULT_TIMEOUT_MS = 2500;

/**
 * Probe non bloccante verso PRINT_BRIDGE_HEALTH_URL (es. bridge /health).
 */
export async function probePrintBridgeHealth(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<PrintBridgeHealthProbe> {
  const checkedAt = new Date().toISOString();
  const url = process.env.PRINT_BRIDGE_HEALTH_URL?.trim();

  if (!url) {
    return {
      online: false,
      responseTimeMs: null,
      checkedAt,
      error:
        "Print Bridge non configurato (manca PRINT_BRIDGE_HEALTH_URL sul server)",
      configured: false,
    };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ac.signal,
      cache: "no-store",
    });
    const responseTimeMs = Date.now() - started;
    clearTimeout(timer);

    if (!res.ok) {
      return {
        online: false,
        responseTimeMs,
        checkedAt,
        error: `HTTP ${res.status}`,
        configured: true,
      };
    }

    return {
      online: true,
      responseTimeMs,
      checkedAt,
      error: null,
      configured: true,
    };
  } catch (e) {
    clearTimeout(timer);
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? `Timeout dopo ${timeoutMs}ms`
        : "Bridge non raggiungibile dalla rete del server";
    return {
      online: false,
      responseTimeMs: null,
      checkedAt,
      error: msg,
      configured: true,
    };
  }
}
