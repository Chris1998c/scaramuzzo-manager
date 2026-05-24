export type CustomerNameFields = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export function formatCustomerDisplayName(
  c: CustomerNameFields | undefined,
  customerId: string,
): string {
  const fn = String(c?.first_name ?? "").trim();
  const ln = String(c?.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  const phone = String(c?.phone ?? "").trim();
  if (phone) return phone;
  const email = String(c?.email ?? "").trim();
  if (email) return email;
  return `Cliente #${customerId}`;
}
