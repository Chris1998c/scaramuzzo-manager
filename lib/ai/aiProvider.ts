import "server-only";

/**
 * Provider resolver per le feature AI (server-only).
 *
 * Sceglie il provider tramite env AI_PROVIDER e restituisce la configurazione
 * (endpoint, chiave, modello) senza effettuare alcuna chiamata di rete e senza
 * side effect: è una funzione pura rispetto a process.env.
 *
 * Nessun consumer è ancora collegato a questo resolver: introdurlo NON cambia
 * il comportamento runtime esistente.
 */

export type AiProvider = "openai" | "deepseek";

export type ResolvedAiProvider = {
  provider: AiProvider;
  apiUrl: string;
  /** undefined se la chiave non è configurata. */
  apiKey: string | undefined;
  model: string;
  /** true solo se apiKey è presente e non vuota. */
  configured: boolean;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";

function clean(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/**
 * Normalizza AI_PROVIDER. Qualsiasi valore assente o sconosciuto ricade su
 * "openai": scelta fail-safe per non introdurre regressioni (il comportamento
 * storico del repo è OpenAI). Un provider sconosciuto non deve "spegnere" l'AI.
 */
function normalizeProvider(raw: string | undefined): AiProvider {
  return clean(raw)?.toLowerCase() === "deepseek" ? "deepseek" : "openai";
}

export function resolveAiProvider(): ResolvedAiProvider {
  const provider = normalizeProvider(process.env.AI_PROVIDER);

  if (provider === "deepseek") {
    const apiKey = clean(process.env.DEEPSEEK_API_KEY);
    return {
      provider,
      apiUrl: DEEPSEEK_URL,
      apiKey,
      model: clean(process.env.DEEPSEEK_MODEL) ?? DEEPSEEK_DEFAULT_MODEL,
      configured: apiKey != null,
    };
  }

  const apiKey = clean(process.env.OPENAI_API_KEY);
  return {
    provider,
    apiUrl: OPENAI_URL,
    apiKey,
    model: clean(process.env.OPENAI_MODEL) ?? OPENAI_DEFAULT_MODEL,
    configured: apiKey != null,
  };
}
