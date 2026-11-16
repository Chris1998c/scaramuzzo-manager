/**
 * Gate lancio: feature generative AI (OpenAI) disabilitate finché non abilitate
 * esplicitamente con SCARAMUZZO_AI_FEATURES_ENABLED=true.
 * Insight deterministici e resto del gestionale non passano da questo gate.
 */
export function isAiFeaturesEnabled(): boolean {
  return process.env.SCARAMUZZO_AI_FEATURES_ENABLED === "true";
}

export const AI_FEATURES_DISABLED_MESSAGE =
  "Questa funzione non è disponibile in questa versione.";
