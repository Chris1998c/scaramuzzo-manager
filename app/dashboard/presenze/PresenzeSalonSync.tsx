"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

/** Allinea header ActiveSalon → ?salon_id e forza refresh RSC (come Report). */
export default function PresenzeSalonSync({ canChooseSalon }: { canChooseSalon: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeSalonId, isReady } = useActiveSalon();

  useEffect(() => {
    if (!canChooseSalon) return;
    if (!isReady) return;
    if (!activeSalonId) return;

    const params = new URLSearchParams(searchParams.toString());
    const current = params.get("salon_id");
    if (current === "all" || current === "0") return;

    if (current !== String(activeSalonId)) {
      params.set("salon_id", String(activeSalonId));
      params.delete("staff_id");
      router.replace(`/dashboard/presenze?${params.toString()}`);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeSalonId, canChooseSalon]);

  return null;
}
