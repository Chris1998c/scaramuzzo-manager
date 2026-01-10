export const MAGAZZINO_CENTRALE_ID = 0 as const;

export const ROLES = {
  COORDINATOR: "coordinator",
  MAGAZZINO: "magazzino",
  RECEPTION: "reception",
  CLIENTE: "cliente",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES] | string;

export function isValidSalonId(id: unknown): id is number {
  const n = typeof id === "number" ? id : Number(id);
  // accetta 0 e positivi
  return Number.isFinite(n) && n >= 0;
}

export function toSalonId(id: unknown): number | null {
  if (id === null || id === undefined || id === "") return null;
  const n = typeof id === "number" ? id : Number(id);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
