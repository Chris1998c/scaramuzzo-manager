import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabaseServer";
import { type RoleName } from "@/lib/getUserAccess";
import { requireDashboardAccess } from "@/lib/requireDashboardAccess";
import { canAccessClientiWeb } from "@/lib/clientiWebAccess";
import { fetchCustomersBrowse } from "@/lib/customers/clientiListQuery";
import { PageShell } from "@/components/ui/PageHeader";
import ClientiView from "./ClientiView";

export const dynamic = "force-dynamic";

function isNextRedirect(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

export default async function ClientiPage() {
  let role: RoleName | undefined;
  let defaultSalonId: number | null | undefined;
  let staffSalonId: number | null | undefined;
  let allowedSalonIds: number[] | undefined;

  try {
    const supabase = await createServerSupabase();
    const access = await requireDashboardAccess();
    role = access.role;
    defaultSalonId = access.defaultSalonId;
    staffSalonId = access.staffSalonId;
    allowedSalonIds = access.allowedSalonIds;

    if (!canAccessClientiWeb(access.role)) {
      redirect("/dashboard");
    }

    const { data: initial, error: browseError } = await fetchCustomersBrowse(supabase);

    if (browseError) {
      throw new Error("Errore caricamento clienti: " + browseError);
    }

    return (
      <PageShell className="space-y-5">
        {/* Titolo già nel chrome DashboardShell: solo meta operativa. */}
        <p className="text-sm text-white/50">Anagrafiche condivise tra i saloni</p>
        <ClientiView initial={initial} />
      </PageShell>
    );
  } catch (e) {
 if (isNextRedirect(e)) throw e;
 const err = e instanceof Error ? e : new Error(String(e));
 const cause = err.cause;
 console.error("[CLIENTI_PAGE_ERROR]", {
      message: err.message,
      stack: err.stack,
      cause:
        cause instanceof Error
          ? { message: cause.message, stack: cause.stack, name: cause.name }
          : cause,
      role,
      defaultSalonId,
      staffSalonId,
      allowedSalonIds,
      activeSalonId: defaultSalonId ?? staffSalonId ?? null,
    });
    throw e;
  }
}
