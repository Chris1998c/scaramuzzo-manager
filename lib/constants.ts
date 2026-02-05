export const MAGAZZINO_CENTRALE_ID = 5;

export const REAL_SALON_IDS = [1, 2, 3, 4] as const;
export type RealSalonId = (typeof REAL_SALON_IDS)[number];

export const ROLES = {
  COORDINATOR: "coordinator",
  MAGAZZINO: "magazzino",
  RECEPTION: "reception",
  CLIENTE: "cliente",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES] | string;

export const isRealSalonId = (id: unknown): id is RealSalonId => {
  const n = typeof id === "number" ? id : Number(id);
  return Number.isFinite(n) && (REAL_SALON_IDS as readonly number[]).includes(n);
};

// ✅ saloni validi: 1..5 (include centrale=5)
export function isValidSalonId(id: unknown): id is number {
  const n = typeof id === "number" ? id : Number(id);
  return Number.isFinite(n) && n >= 1 && n <= MAGAZZINO_CENTRALE_ID;
}

// ✅ parse salon id (1..5) oppure null
export function toSalonId(id: unknown): number | null {
  if (id === null || id === undefined || id === "") return null;
  const n = typeof id === "number" ? id : Number(id);
  return Number.isFinite(n) && n >= 1 && n <= MAGAZZINO_CENTRALE_ID ? n : null;
}
