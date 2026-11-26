import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabaseServer";
import { requireDashboardAccess } from "@/lib/requireDashboardAccess";
import { fetchServicesForSettings } from "@/lib/servicesCatalog";
import { fetchProductsForSettings } from "@/lib/productsSettings";
import { fetchStaffForSettings } from "@/lib/staffSettingsServer";
import { fetchSalonsForSettings } from "@/lib/salonsSettings";
import { fetchFiscalSettingsSnapshot } from "@/lib/fiscalSettings";
import { fetchCustomersDomainSnapshot } from "@/lib/customersDomainSnapshot";
import type { CustomersDomainSnapshot } from "@/lib/customersDomainTypes";
import { PageHeader } from "@/components/ui/PageHeader";
import ImpostazioniShell from "@/components/settings/ImpostazioniShell";

export const metadata = {
  title: "Impostazioni | Scaramuzzo Manager",
  description: "Listini, collaboratori, saloni e parametri operativi",
};

type ImpostazioniSearchParams = Record<string, string | string[] | undefined>;

export default async function ImpostazioniPage({
  searchParams,
}: {
  searchParams?: Promise<ImpostazioniSearchParams>;
}) {
  const supabase = await createServerSupabase();
  const access = await requireDashboardAccess();
  // Il ruolo "cliente" non accede alle impostazioni.
  if (access.role === "cliente") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const rawSalon = sp.salon_id;
  const querySalon =
    typeof rawSalon === "string"
      ? Number(rawSalon)
      : Array.isArray(rawSalon)
        ? Number(rawSalon[0])
        : NaN;

  const baseSalonId = access.staffSalonId ?? access.defaultSalonId ?? null;
  let dataSalonId = baseSalonId;
  if (access.role === "coordinator" || access.role === "magazzino") {
    if (
      Number.isFinite(querySalon) &&
      querySalon > 0 &&
      access.allowedSalonIds.includes(querySalon)
    ) {
      dataSalonId = querySalon;
    }
  }

  const salonMeta =
    dataSalonId != null ? access.allowedSalons.find((s) => s.id === dataSalonId) : null;

  const canManageServices = access.role === "coordinator";
  const canManageProducts = access.role === "coordinator";
  const canManageStaff = access.role === "coordinator";
  const canManageOperationalCalendar = access.role === "coordinator";
  const canUseSessionPrinter = ["reception", "coordinator", "magazzino"].includes(
    access.role,
  );

  const emptyCustomersSnapshot = (): CustomersDomainSnapshot => {
    const t = new Date().toISOString();
    return {
      fetchedAt: t,
      counts: {
        customers: null,
        customer_profile: null,
        customer_notes: null,
        customer_tech_notes: null,
        customer_technical_cards: null,
        technical_sheets: null,
        customer_service_cards: null,
      },
    };
  };

  const [
    servicesSettled,
    categoriesSettled,
    productsSettled,
    staffSettled,
    salonsSettled,
    fiscalSettled,
    customersSettled,
  ] = await Promise.all([
    fetchServicesForSettings(supabase, dataSalonId ?? 0)
      .then((data) => ({ ok: true as const, data }))
      .catch((e) => {
        console.error("Impostazioni: caricamento servizi", e);
        return { ok: false as const, data: [] as Awaited<ReturnType<typeof fetchServicesForSettings>> };
      }),
    Promise.resolve(
      supabase.from("service_categories").select("id, name").order("name"),
    )
      .then(({ data: catRows }) =>
        (catRows ?? []).map((c: { id: number; name: string }) => ({
          id: Number(c.id),
          name: String(c.name ?? ""),
        })),
      )
      .then((data) => ({ ok: true as const, data }))
      .catch((e: unknown) => {
        console.error("Impostazioni: categorie servizi", e);
        return { ok: false as const, data: [] as { id: number; name: string }[] };
      }),
    fetchProductsForSettings(supabase)
      .then((data) => ({ ok: true as const, data }))
      .catch((e) => {
        console.error("Impostazioni: caricamento prodotti", e);
        return { ok: false as const, data: [] as Awaited<ReturnType<typeof fetchProductsForSettings>> };
      }),
    fetchStaffForSettings(supabase)
      .then((data) => ({ ok: true as const, data }))
      .catch((e) => {
        console.error("Impostazioni: caricamento staff", e);
        return { ok: false as const, data: [] as Awaited<ReturnType<typeof fetchStaffForSettings>> };
      }),
    fetchSalonsForSettings(supabase)
      .then((data) => ({ ok: true as const, data }))
      .catch((e) => {
        console.error("Impostazioni: caricamento saloni", e);
        return { ok: false as const, data: [] as Awaited<ReturnType<typeof fetchSalonsForSettings>> };
      }),
    fetchFiscalSettingsSnapshot(supabase, dataSalonId)
      .then((data) => ({ ok: true as const, data }))
      .catch((e) => {
        console.error("Impostazioni: snapshot fiscale", e);
        return {
          ok: false as const,
          data: null as Awaited<ReturnType<typeof fetchFiscalSettingsSnapshot>>,
        };
      }),
    fetchCustomersDomainSnapshot(supabase)
      .then((data) => ({ ok: true as const, data }))
      .catch((e) => {
        console.error("Impostazioni: dominio clienti", e);
        return { ok: false as const, data: emptyCustomersSnapshot() };
      }),
  ]);

  const services = servicesSettled.data;
  const servicesUnavailable = !servicesSettled.ok;
  const categories = categoriesSettled.data;
  const products = productsSettled.data;
  const productsUnavailable = !productsSettled.ok;
  const staff = staffSettled.data;
  const staffUnavailable = !staffSettled.ok;
  const salons = salonsSettled.data;
  const salonsUnavailable = !salonsSettled.ok;
  const fiscalSnapshot = fiscalSettled.data;
  const fiscalUnavailable = !fiscalSettled.ok;
  const customersDomainSnapshot = customersSettled.data;
  const customersDomainUnavailable = !customersSettled.ok;
  const hasUnavailableData =
    servicesUnavailable ||
    productsUnavailable ||
    staffUnavailable ||
    salonsUnavailable ||
    fiscalUnavailable ||
    customersDomainUnavailable;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-12">
      <PageHeader meta="Listini, collaboratori, saloni e parametri operativi" />

      {hasUnavailableData ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200/90">
          Alcuni dati non sono disponibili in questo momento. Puoi continuare a usare le impostazioni
          già caricate; riprova più tardi per completare il caricamento.
        </div>
      ) : null}

      <ImpostazioniShell
        initialServices={services}
        initialProducts={products}
        initialStaff={staff}
        initialSalonId={dataSalonId}
        initialSalonLabel={salonMeta?.name ?? null}
        categories={categories}
        canManageServices={canManageServices}
        canManageProducts={canManageProducts}
        canManageStaff={canManageStaff}
        canManageOperationalCalendar={canManageOperationalCalendar}
        initialSalons={salons}
        initialFiscalSnapshot={fiscalSnapshot}
        canUseSessionPrinter={canUseSessionPrinter}
        initialCustomersDomainSnapshot={customersDomainSnapshot}
      />
    </div>
  );
}
