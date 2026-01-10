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
