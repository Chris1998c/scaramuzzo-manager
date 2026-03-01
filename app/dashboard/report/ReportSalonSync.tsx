"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

export default function ReportSalonSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeSalonId, isReady } = useActiveSalon();

  useEffect(() => {
    if (!isReady) return;
    if (!activeSalonId) return;

    const params = new URLSearchParams(searchParams.toString());
    const current = params.get("salon_id");

    if (current !== String(activeSalonId)) {
      params.set("salon_id", String(activeSalonId));
      params.delete("staff_id"); // reset filtro staff quando cambia salone
      router.replace(`/dashboard/report?${params.toString()}`);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeSalonId]);

  return null;
}