export type RoleNameForFiscalJobs =
  | "coordinator"
  | "reception"
  | "magazzino"
  | "cliente";

/**
 * Accesso dashboard job fiscali (client + server).
 * Coordinator e magazzino: tutti i saloni; reception: solo salone operativo (filtro server).
 */
export function canAccessFiscalJobsWeb(role: RoleNameForFiscalJobs): boolean {
  return role === "coordinator" || role === "reception" || role === "magazzino";
}

/** Azioni operative job fiscali: coordinator e magazzino. */
export function canActOnFiscalJobsWeb(role: RoleNameForFiscalJobs): boolean {
  return role === "coordinator" || role === "magazzino";
}
