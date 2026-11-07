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
    <div className="max-w-[1600px] mx-auto px-3 py-4 md:px-5 space-y-4 pb-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold text-[#f3d8b6] tracking-tight inline-flex items-center gap-2">
            <Radio className="shrink-0 text-[#f3d8b6]/80" size={18} strokeWidth={1.85} aria-hidden />
            Bridge stampa
          </h1>
          {showSalonFilter ? (
            <p className="text-sm text-white/50 mt-0.5">
              {salonFilter != null ? `Salone ${salonFilter}` : "Tutti i saloni"}
            </p>
          ) : salonFilter != null ? (
            <p className="text-sm text-white/50 mt-0.5">Salone {salonFilter}</p>
          ) : null}
        </div>
        <Link
          href="/dashboard/fiscale"
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-[#f3d8b6] hover:bg-white/[0.06]"
        >
          Job fiscali
        </Link>
      </header>

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
