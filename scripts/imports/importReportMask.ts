export function maskNominativo(value: string | null | undefined): string {
  const key = (value ?? "").trim().toUpperCase();
  if (!key) return "(vuoto)";
  if (key.length <= 4) return `${key[0]}***`;
  return `${key.slice(0, 4)}***`;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return "***";
  return `***${phone.slice(-4)}`;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***@***";
  return `***${email.slice(at)}`;
}

export function maskContactKey(key: string): string {
  if (key.includes("@")) return maskEmail(key);
  if (/^\+?\d+$/.test(key)) return maskPhone(key);
  return maskNominativo(key);
}
