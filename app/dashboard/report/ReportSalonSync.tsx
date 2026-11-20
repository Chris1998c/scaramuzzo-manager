"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { nextReportSalonQueryId } from "@/lib/reports/reportSalonQuerySync";

/**
 * Header ActiveSalon → ?salon_id + refresh RSC.
 * Conserva date/tab/subtab; reset solo staff_id (filtro sede-specifico).
 * Non deve essere contrastato da ReportFilters (niente sync inverso prop→URL).
 */
export default function ReportSalonSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeSalonId, isReady, canChooseSalon } = useActiveSalon();

  useEffect(() => {
    if (!isReady) return;
    if (!canChooseSalon) return;

    const next = nextReportSalonQueryId(activeSalonId, searchParams.get("salon_id"));
    if (!next) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("salon_id", next);
    params.delete("staff_id");
    router.replace(`/dashboard/report?${params.toString()}`, { scroll: false });
    router.refresh();
  }, [isReady, canChooseSalon, activeSalonId, router, searchParams]);

  return null;
}
