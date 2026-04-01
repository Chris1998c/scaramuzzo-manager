import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { fetchServicesForSettings } from "@/lib/servicesCatalog";
import { fetchProductsForSettings } from "@/lib/productsSettings";
import { fetchStaffForSettings } from "@/lib/staffSettings";
import { fetchSalonsForSettings } from "@/lib/salonsSettings";
import { fetchFiscalSettingsSnapshot } from "@/lib/fiscalSettings";
import { fetchCustomersDomainSnapshot } from "@/lib/customersDomainSnapshot";
import type { CustomersDomainSnapshot } from "@/lib/customersDomainTypes";
import ImpostazioniShell from "@/components/settings/ImpostazioniShell";

export const metadata = {
  title: "Impostazioni | Scaramuzzo Manager",
  description: "Centro di controllo del gestionale",
};

type ImpostazioniSearchParams = Record<string, string | string[] | undefined>;

export default async function ImpostazioniPage({
  searchParams,
}: {
  searchParams?: Promise<ImpostazioniSearchParams>;
}) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const access = await getUserAccess();
  // Coerenza accessi enterprise: il ruolo "cliente" non deve vedere il centro di controllo.
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

  let services: Awaited<ReturnType<typeof fetchServicesForSettings>> = [];
  let servicesUnavailable = false;
  try {
    services = await fetchServicesForSettings(supabase, dataSalonId ?? 0);
  } catch (e) {
    console.error("Impostazioni: caricamento servizi", e);
    services = [];
    servicesUnavailable = true;
  }

  const { data: catRows } = await supabase
    .from("service_categories")
    .select("id, name")
    .order("name");

  const categories = (catRows ?? []).map((c: { id: number; name: string }) => ({
    id: Number(c.id),
    name: String(c.name ?? ""),
  }));

  const canManageServices = access.role === "coordinator";
  const canManageProducts = access.role === "coordinator";
  const canManageStaff = access.role === "coordinator";

  let products: Awaited<ReturnType<typeof fetchProductsForSettings>> = [];
  let productsUnavailable = false;
  try {
    products = await fetchProductsForSettings(supabase);
  } catch (e) {
    console.error("Impostazioni: caricamento prodotti", e);
    products = [];
    productsUnavailable = true;
  }

  let staff: Awaited<ReturnType<typeof fetchStaffForSettings>> = [];
  let staffUnavailable = false;
  try {
    staff = await fetchStaffForSettings(supabase);
  } catch (e) {
    console.error("Impostazioni: caricamento staff", e);
    staff = [];
    staffUnavailable = true;
  }

  let salons: Awaited<ReturnType<typeof fetchSalonsForSettings>> = [];
  let salonsUnavailable = false;
  try {
    salons = await fetchSalonsForSettings(supabase);
  } catch (e) {
    console.error("Impostazioni: caricamento saloni", e);
    salons = [];
    salonsUnavailable = true;
  }

  let fiscalSnapshot: Awaited<ReturnType<typeof fetchFiscalSettingsSnapshot>> = null;
  let fiscalUnavailable = false;
  try {
    fiscalSnapshot = await fetchFiscalSettingsSnapshot(supabase, dataSalonId);
  } catch (e) {
    console.error("Impostazioni: snapshot fiscale", e);
    fiscalSnapshot = null;
    fiscalUnavailable = true;
  }

  const canUseSessionPrinter = ["reception", "coordinator", "magazzino"].includes(
    access.role,
  );

  let customersDomainSnapshot: CustomersDomainSnapshot;
  let customersDomainUnavailable = false;
  try {
    customersDomainSnapshot = await fetchCustomersDomainSnapshot(supabase);
  } catch (e) {
    console.error("Impostazioni: dominio clienti", e);
    const t = new Date().toISOString();
    customersDomainSnapshot = {
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
    customersDomainUnavailable = true;
  }
  const hasUnavailableData =
    servicesUnavailable ||
    productsUnavailable ||
    staffUnavailable ||
    salonsUnavailable ||
    fiscalUnavailable ||
    customersDomainUnavailable;

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-12">
      <header className="relative overflow-hidden rounded-[2.5rem] border border-[#5c3a21]/50 bg-[#24140e]/60 p-8 md:p-10 backdrop-blur-xl shadow-2xl">
        <div className="relative z-10 space-y-4 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f3d8b6]/10 border border-[#f3d8b6]/20 text-[#f3d8b6] text-xs font-bold tracking-widest uppercase">
            <Sparkles size={14} /> Centro di controllo
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-[#f3d8b6] tracking-tight">
            Impostazioni
          </h1>
          <p className="text-[#c9b299] text-base md:text-lg leading-relaxed">
            Configura listini, canali operativi e parametri del salone da un unico punto. Le sezioni
            sono organizzate per dominio così ogni blocco può evolvere senza rifare il layout.
          </p>
        </div>
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#f3d8b6]/10 blur-[120px] rounded-full pointer-events-none" />
      </header>

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
        initialSalons={salons}
        initialFiscalSnapshot={fiscalSnapshot}
        canUseSessionPrinter={canUseSessionPrinter}
        initialCustomersDomainSnapshot={customersDomainSnapshot}
      />
    </div>
  );
}
