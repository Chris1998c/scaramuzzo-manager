"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

/**
 * Allinea ?salon_id sulla home con la Vista (provider / localStorage) quando manca o è invalido.
 * Solo coordinator/magazzino; server legge poi lo stesso param per i KPI.
 */
export default function DashboardSalonQuerySync() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isReady, canChooseSalon, allowedSalonIds, activeSalonId } = useActiveSalon();

  useEffect(() => {
    if (pathname !== "/dashboard") return;
    if (!isReady || !canChooseSalon) return;

    const raw = searchParams.get("salon_id");
    const q = raw ? Number(raw) : NaN;
    const queryOk = Number.isFinite(q) && allowedSalonIds.includes(q);

    if (queryOk) return;

    if (activeSalonId != null && allowedSalonIds.includes(activeSalonId)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("salon_id", String(activeSalonId));
      router.replace(`/dashboard?${params.toString()}`, { scroll: false });
    }
  }, [pathname, isReady, canChooseSalon, allowedSalonIds, activeSalonId, router, searchParams]);

  return null;
}
