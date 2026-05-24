import { getUserAccess } from "@/lib/getUserAccess";

export function exportUnauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Non autenticato" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function isExportAuthError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return msg === "Not authenticated";
}

export async function requireCoordinatorExportAccess(): Promise<
  | { ok: true; access: Awaited<ReturnType<typeof getUserAccess>> }
  | { ok: false; response: Response }
> {
  try {
    const access = await getUserAccess();
    if (access.role !== "coordinator") {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: "Non autorizzato" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    return { ok: true, access };
  } catch (e) {
    if (isExportAuthError(e)) {
      return { ok: false, response: exportUnauthorizedResponse() };
    }
    throw e;
  }
}
