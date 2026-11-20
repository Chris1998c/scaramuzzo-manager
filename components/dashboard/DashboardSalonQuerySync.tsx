"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { nextDashboardSalonQueryId } from "@/lib/dashboard/dashboardSalonQuerySync";

/**
 * Header ActiveSalon → ?salon_id sulla home (KPI server).
 * Se l’URL manca o diverge (es. ritorno da Report senza query, o default Magazzino),
 * riscrive la query; replace con nuova query rifetcha la RSC.
 */
export default function DashboardSalonQuerySync() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isReady, canChooseSalon, allowedSalonIds, activeSalonId } = useActiveSalon();

  useEffect(() => {
    if (pathname !== "/dashboard") return;
    if (!isReady || !canChooseSalon) return;

    const next = nextDashboardSalonQueryId(
      activeSalonId,
      searchParams.get("salon_id"),
      allowedSalonIds,
    );
    if (!next) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("salon_id", next);
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  }, [pathname, isReady, canChooseSalon, allowedSalonIds, activeSalonId, router, searchParams]);

  return null;
}
