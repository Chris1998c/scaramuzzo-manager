/** Classi UI condivise Magazzino (dark bronze Scaramuzzo). */
export const magazzinoInputClass =
  "w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder:text-white/40 focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30";

export const magazzinoSelectClass =
  "w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white focus:border-[#f3d8b6]/50 focus:outline-none focus:ring-1 focus:ring-[#f3d8b6]/30";

export const magazzinoLightInputClass =
  "w-full p-3 rounded-xl border border-[#341A09]/15 bg-white text-[#341A09] placeholder:text-[#341A09]/40 focus:border-[#B88A54]/60 focus:outline-none focus:ring-1 focus:ring-[#B88A54]/30";

export type MovementType =
  | "carico"
  | "scarico"
  | "trasferimento"
  | "vendita"
  | "storno"
  | string;

export type MagazzinoBadgeTone = "ok" | "warn" | "err" | "neutral" | "info";

export function movementBadgeTone(type: MovementType): MagazzinoBadgeTone {
  if (type === "carico" || type === "storno") return "ok";
  if (type === "scarico" || type === "vendita") return "err";
  if (type === "trasferimento") return "info";
  return "neutral";
}

export function movementBadgeLabel(type: MovementType): string {
  return String(type || "—");
}

export function formatMagazzinoCurrency(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMagazzinoDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
