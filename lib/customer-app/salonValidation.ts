import { MAGAZZINO_CENTRALE_ID, isOperationalSalonId } from "@/lib/constants";

export function parseCustomerAppSalonId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  if (n === MAGAZZINO_CENTRALE_ID) return null;
  if (!isOperationalSalonId(n)) return null;
  return n;
}

export function salonIdInvalidMessage(): string {
  return "salon_id non valido";
}
