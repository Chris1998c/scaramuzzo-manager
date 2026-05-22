/** Campi minimi per autocomplete / filtro clienti (solo UI, nessun schema DB). */
export type CustomerSearchable = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  customer_code?: string | null;
  email?: string | null;
};

/** Testo ricerca: minuscolo, senza accenti, spazi collassati. */
export function normalizeCustomerSearchValue(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Telefono: solo cifre (ignora +39, spazi, trattini). */
export function normalizePhoneSearch(value: string): string {
  return String(value ?? "").replace(/\D/g, "");
}

function searchHaystacks(customer: CustomerSearchable): string[] {
  const first = normalizeCustomerSearchValue(String(customer.first_name ?? ""));
  const last = normalizeCustomerSearchValue(String(customer.last_name ?? ""));
  const code = normalizeCustomerSearchValue(String(customer.customer_code ?? ""));
  const email = normalizeCustomerSearchValue(String(customer.email ?? ""));
  const fullFL = [first, last].filter(Boolean).join(" ");
  const fullLF = [last, first].filter(Boolean).join(" ");
  return [first, last, fullFL, fullLF, code, email].filter(Boolean);
}

function tokenMatchesField(
  token: string,
  fields: string[],
  phoneDigits: string,
): boolean {
  if (fields.some((f) => f.includes(token))) return true;
  const tokenDigits = normalizePhoneSearch(token);
  if (tokenDigits.length >= 3 && phoneDigits.includes(tokenDigits)) return true;
  return false;
}

/**
 * Match locale su cliente già caricato (ordine nome/cognome, accenti, telefono, codice, email).
 */
export function customerMatchesSearch(
  customer: CustomerSearchable,
  rawQuery: string,
): boolean {
  const q = normalizeCustomerSearchValue(rawQuery);
  if (!q) return true;

  const fields = searchHaystacks(customer);
  const phoneDigits = normalizePhoneSearch(String(customer.phone ?? ""));

  if (fields.some((f) => f.includes(q))) return true;

  const qDigits = normalizePhoneSearch(rawQuery);
  if (qDigits.length >= 3 && phoneDigits.includes(qDigits)) return true;

  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length <= 1) {
    return tokenMatchesField(tokens[0] ?? q, fields, phoneDigits);
  }

  return tokens.every((token) => tokenMatchesField(token, fields, phoneDigits));
}

export function filterCustomersBySearch<T extends CustomerSearchable>(
  customers: T[],
  rawQuery: string,
): T[] {
  const trimmed = String(rawQuery ?? "").trim();
  if (!trimmed) return customers;
  return customers.filter((c) => customerMatchesSearch(c, trimmed));
}
