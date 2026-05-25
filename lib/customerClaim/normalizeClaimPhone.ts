import "server-only";

/** Solo cifre: rimuove spazi, +, trattini e altri non-numerici. */
export function stripPhoneToDigits(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/**
 * Forme italiane equivalenti per lookup su `customers.phone`:
 * - 389… (nazionale)
 * - 39389… / +39389… (internazionale)
 * - 00389… → già ridotto a cifre con prefisso 39
 */
export function claimPhoneLookupKeys(digits: string): string[] {
  const keys = new Set<string>();
  const add = (value: string) => {
    const t = value.trim();
    if (t) keys.add(t);
  };

  add(digits);

  if (digits.startsWith("39") && digits.length >= 11) {
    const national = digits.slice(2);
    add(national);
    add(`+39${national}`);
    add(`+${digits}`);
  } else if (digits.startsWith("0") && digits.length >= 10) {
    const national = digits.slice(1);
    add(national);
    add(`39${national}`);
    add(`+39${national}`);
  } else if (/^3\d{8,}$/.test(digits)) {
    add(`39${digits}`);
    add(`+39${digits}`);
  }

  return [...keys];
}

/** Cifre nazionali mobili IT (es. 3895817411) per confronto tra varianti. */
export function canonicalItalianMobileDigits(digits: string): string | null {
  const d = stripPhoneToDigits(digits);
  if (!d || d.length < 9) return null;

  if (d.startsWith("39") && d.length >= 11) return d.slice(2);
  if (d.startsWith("0") && d.length >= 10) return d.slice(1);
  if (/^3\d{8,}$/.test(d)) return d;
  return null;
}

export type ParseClaimPhoneResult =
  | { ok: true; digits: string; lookupKeys: string[]; canonical: string }
  | { ok: false };

/**
 * Valida e normalizza input claim (body.phone).
 * Minimo 9 cifre dopo pulizia (mobile IT).
 */
export function parseClaimPhoneInput(raw: string): ParseClaimPhoneResult {
  const digits = stripPhoneToDigits(raw);
  if (!digits || digits.length < 9) return { ok: false };

  const canonical = canonicalItalianMobileDigits(digits);
  if (!canonical) return { ok: false };

  return {
    ok: true,
    digits,
    lookupKeys: claimPhoneLookupKeys(digits),
    canonical,
  };
}

export function claimPhonesEquivalent(
  storedPhone: string,
  canonical: string,
): boolean {
  const storedCanon = canonicalItalianMobileDigits(stripPhoneToDigits(storedPhone));
  return storedCanon != null && storedCanon === canonical;
}
