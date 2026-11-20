import "server-only";
import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/getUserAccess";

/**
 * getUserAccess + redirect /login se non autenticato.
 * Evita un secondo auth.getUser() sulle page già dietro middleware.
 */
export async function requireDashboardAccess() {
  try {
    return await getUserAccess();
  } catch (e) {
    if (e instanceof Error && e.message === "Not authenticated") {
      redirect("/login");
    }
    throw e;
  }
}
