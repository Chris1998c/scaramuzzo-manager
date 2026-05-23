/**
 * MOBILE_JWT_SECRET è obbligatorio per tutte le API mobile in produzione.
 * Senza secret il login non deve mai restituire success senza access_token.
 */
export function getMobileJwtSecret(): string | null {
  const s = process.env.MOBILE_JWT_SECRET?.trim();
  return s ? s : null;
}

export function requireMobileJwtSecret(): string {
  const secret = getMobileJwtSecret();
  if (!secret) {
    throw new Error("MOBILE_JWT_SECRET is not set");
  }
  return secret;
}

export function isMobileJwtConfigured(): boolean {
  return getMobileJwtSecret() != null;
}
