import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess, type RoleName } from "@/lib/getUserAccess";
import { canAccessClientiWeb } from "@/lib/clientiWebAccess";
import ClientiView from "./ClientiView";

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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const access = await getUserAccess();
    role = access.role;
    defaultSalonId = access.defaultSalonId;
    staffSalonId = access.staffSalonId;
    allowedSalonIds = access.allowedSalonIds;

    if (!canAccessClientiWeb(access.role)) {
      redirect("/dashboard");
    }

    const { data: customers, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, address, notes")
      .order("last_name", { ascending: true });

    if (error) {
      throw new Error("Errore caricamento clienti: " + error.message);
    }

    const initial = (customers ?? []).map((row) => ({
      ...row,
      customer_code: String(row.id),
    }));

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
            Clienti
          </h1>
          <p className="text-[#c9b299] mt-2">
            Anagrafiche globali condivise tra tutti i saloni
          </p>
        </div>

        <ClientiView initial={initial} />
      </div>
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
