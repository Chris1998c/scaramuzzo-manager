import "server-only";

/**
 * Verifica raggiungibilità del Print Bridge (server → bridge).
 * Configurare PRINT_BRIDGE_HEALTH_URL (es. http://127.0.0.1:9847/health).
 */
export async function checkPrintBridgeReachable(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const url = process.env.PRINT_BRIDGE_HEALTH_URL?.trim();
  if (!url) {
    return {
      ok: false,
      error:
        "Print Bridge non configurato (manca PRINT_BRIDGE_HEALTH_URL sul server)",
    };
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 4500);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ac.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) {
      return {
        ok: false,
        error: `Print Bridge non risponde correttamente (HTTP ${res.status})`,
      };
    }
    return { ok: true };
  } catch {
    clearTimeout(t);
    return {
      ok: false,
      error: "Print Bridge non raggiungibile dalla rete del server",
    };
  }
}
