import { ROLES, Role, toSalonId } from "@/lib/constants";

export function getUserRole(user: any): Role {
  return String(user?.user_metadata?.role ?? ROLES.RECEPTION);
}

export function getUserSalonId(user: any): number | null {
  return toSalonId(user?.user_metadata?.salon_id ?? null);
}

export function isAllowedWarehouseRole(role: Role) {
  return role === ROLES.COORDINATOR || role === ROLES.MAGAZZINO || role === ROLES.RECEPTION;
}
export function canAccessSalon(
  user: any,
  salonId: number
): boolean {
  const role = getUserRole(user);
  const userSalonId = getUserSalonId(user);

  if (role === ROLES.COORDINATOR) return true;
  if (role === ROLES.MAGAZZINO) return true;

  // reception → solo il proprio salone
  return userSalonId === salonId;
}

export function canCreateTransfer(user: any): boolean {
  const role = getUserRole(user);
  return role === ROLES.COORDINATOR || role === ROLES.MAGAZZINO;
}

export function canSell(user: any): boolean {
  return getUserRole(user) === ROLES.RECEPTION;
}
