export const MAGAZZINO_CENTRALE_ID = 5;

/** Nomi ufficiali saloni Scaramuzzo (id → label). */
export const SALON_LABELS: Record<number, string> = {
  1: "Roma",
  2: "Corigliano",
  3: "Castrovillari",
  4: "Cosenza",
  5: "Magazzino Centrale",
};

export const SALONS: { id: number; name: string }[] = [1, 2, 3, 4, 5].map((id) => ({
  id,
  name: SALON_LABELS[id] ?? `Salone ${id}`,
}));

export function salonLabel(id: number | null | undefined): string {
  if (id === null || id === undefined) return "-";
  const n = typeof id === "number" ? id : Number(id);
  if (!Number.isFinite(n)) return "-";
  return SALON_LABELS[n] ?? `Salone ${n}`;
}

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

/** Saloni operativi 1..4 — esclude Magazzino Centrale (5). */
export function isOperationalSalonId(id: unknown): id is RealSalonId {
  return isRealSalonId(id);
}

/** Saloni validi 1..5 (include Magazzino Centrale). */
export function isValidSalonId(id: unknown): id is number {
  const n = typeof id === "number" ? id : Number(id);
  return Number.isFinite(n) && n >= 1 && n <= MAGAZZINO_CENTRALE_ID;
}

/** Parse salon id (1..5) oppure null. */
export function toSalonId(id: unknown): number | null {
  if (id === null || id === undefined || id === "") return null;
  const n = typeof id === "number" ? id : Number(id);
  return Number.isFinite(n) && n >= 1 && n <= MAGAZZINO_CENTRALE_ID ? n : null;
}
