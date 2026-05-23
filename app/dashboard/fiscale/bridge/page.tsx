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
    <div className="max-w-[1600px] mx-auto space-y-4 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 rounded-xl p-2 bg-black/30 border border-white/10">
            <Radio className="text-[#f3d8b6]" size={22} strokeWidth={1.7} />
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-[#f3d8b6] tracking-tight">
            Stato stampanti e casse
          </h1>
        </div>
        <Link
          href="/dashboard/fiscale"
          className="rounded-xl border border-white/10 px-3 py-1.5 text-sm text-[#f3d8b6] hover:bg-white/5"
        >
          ← Job fiscali
        </Link>
      </header>

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
