import "server-only";

import type { getUserAccess } from "@/lib/getUserAccess";
import { canActOnFiscalJobsWeb } from "@/lib/fiscalJobsWebAccessShared";

export function requireFiscalJobActor(
  access: Awaited<ReturnType<typeof getUserAccess>>,
): { ok: true } | { ok: false; status: 403; message: string } {
  if (!canActOnFiscalJobsWeb(access.role)) {
    return {
      ok: false,
      status: 403,
      message: "Solo coordinator e magazzino possono eseguire azioni sui job fiscali.",
    };
  }
  return { ok: true };
}

export function assertSalonAccessForFiscalJob(
  access: Awaited<ReturnType<typeof getUserAccess>>,
  jobSalonId: number,
): { ok: true } | { ok: false; status: 403; message: string } {
  if (access.role === "coordinator") return { ok: true };
  if (access.role === "magazzino") {
    if (access.allowedSalonIds.includes(jobSalonId)) return { ok: true };
    return {
      ok: false,
      status: 403,
      message: "Job non nel perimetro saloni consentiti.",
    };
  }
  return { ok: false, status: 403, message: "Non autorizzato." };
}
