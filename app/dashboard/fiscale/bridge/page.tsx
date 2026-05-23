import Link from "next/link";
import { redirect } from "next/navigation";
import { Radio } from "lucide-react";

import BridgeEnterpriseMonitor from "@/components/fiscal/BridgeEnterpriseMonitor";
import { fetchBridgeEnterprisePageData } from "@/lib/bridge/fetchBridgeEnterprisePage";
import {
  canManageBridgeTokens,
  canViewBridgeDashboard,
  resolveBridgeSalonFilter,
} from "@/lib/bridge/bridgeWebAccess";
import { canPickSalonFilterOnFiscalJobs } from "@/lib/fiscalJobsWebAccess";
import { canActOnFiscalJobsWeb } from "@/lib/fiscalJobsWebAccessShared";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";

type PageSearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: Promise<PageSearchParams>;
};

export default async function BridgeMonitorPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const access = await getUserAccess();
  if (!canViewBridgeDashboard(access.role)) redirect("/dashboard");

  const rawSalon = sp.salon_id;
  const querySalonNum =
    typeof rawSalon === "string"
      ? Number(rawSalon)
      : Array.isArray(rawSalon)
        ? Number(rawSalon[0])
        : NaN;
  const querySalonId = Number.isFinite(querySalonNum) ? Math.trunc(querySalonNum) : null;
  const salonFilter = resolveBridgeSalonFilter(access, querySalonId);

  const { rows, bundlesByInstallationId } = await fetchBridgeEnterprisePageData(salonFilter);
  const canManage = canManageBridgeTokens(access.role);
  const canActFiscal = canActOnFiscalJobsWeb(access.role);
  const showSalonFilter = canPickSalonFilterOnFiscalJobs(access.role);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-4">
      <section className="rounded-3xl border border-white/10 bg-scz-dark shadow-[0_0_60px_rgba(0,0,0,0.25)] overflow-hidden">
        <div className="flex flex-col gap-4 p-5 md:p-7 bg-black/20 border-b border-white/10 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="shrink-0 rounded-2xl p-3 bg-black/30 border border-white/10">
              <Radio className="text-[#f3d8b6]" size={28} strokeWidth={1.7} />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1">
                Cassa fiscale
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                Stato stampanti e cassa
              </h1>
              <p className="text-[#c9b299] mt-1 text-sm md:text-base max-w-xl">
                Controllo rapido: la cassa è collegata, la stampante risponde e gli ultimi documenti
                fiscali.
                {canManage ? " Il coordinator può gestire i collegamenti in fondo pagina." : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/dashboard/fiscale"
              className="rounded-xl border border-white/10 px-3 py-2 text-[#f3d8b6] hover:bg-white/5"
            >
              ← Job fiscali
            </Link>
          </div>
        </div>
      </section>

      {showSalonFilter ? (
        <p className="text-sm text-[#c9b299]">
          Stai visualizzando:{" "}
          {salonFilter != null ? (
            <strong className="text-[#f3d8b6]">salone {salonFilter}</strong>
          ) : (
            <strong className="text-[#f3d8b6]">tutti i saloni</strong>
          )}
        </p>
      ) : salonFilter != null ? (
        <p className="text-sm text-[#c9b299]">
          Il tuo salone: <strong className="text-[#f3d8b6]">{salonFilter}</strong>
        </p>
      ) : null}

      <BridgeEnterpriseMonitor
        initialRows={rows}
        initialBundles={bundlesByInstallationId}
        canManage={canManage}
        canActFiscal={canActFiscal}
        salonFilter={salonFilter}
      />
    </div>
  );
}
