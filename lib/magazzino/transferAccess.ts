import { isOperationalSalonId } from "@/lib/constants";

/**
 * Magazzino (user_salons tipicamente [5]): può spedire dal proprio hub
 * verso sedi operative 1–4 senza dover avere la destinazione in allowedSalonIds
 * (la cassa destinazione resta fuori scope).
 * Coordinator: from/to entrambi nei saloni consentiti.
 * Reception: gestita a parte nella route (from forzato, to operativo).
 */
export function canTransferBetweenSalons(args: {
  role: "coordinator" | "reception" | "magazzino" | "cliente";
  allowedSalonIds: number[];
  fromSalon: number;
  toSalon: number;
}): boolean {
  const { role, allowedSalonIds, fromSalon, toSalon } = args;
  if (!Number.isFinite(fromSalon) || !Number.isFinite(toSalon)) return false;
  if (fromSalon === toSalon) return false;

  if (role === "coordinator") {
    return (
      allowedSalonIds.includes(fromSalon) && allowedSalonIds.includes(toSalon)
    );
  }

  if (role === "magazzino") {
    if (!allowedSalonIds.includes(fromSalon)) return false;
    // Destinazione: sede operativa, anche se non in user_salons.
    return isOperationalSalonId(toSalon);
  }

  return false;
}
