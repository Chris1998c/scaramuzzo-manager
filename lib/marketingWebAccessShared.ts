/**
 * Accesso modulo Marketing WhatsApp (manuale): stesso perimetro del CRM Clienti
 * (coordinator, reception, magazzino). Importabile da client e server (no "server-only").
 */
export function canAccessMarketingWeb(
  role: "coordinator" | "reception" | "magazzino" | "cliente",
): boolean {
  return role === "coordinator" || role === "reception" || role === "magazzino";
}
