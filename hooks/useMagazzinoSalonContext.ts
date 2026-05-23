"use client";

import { useMemo } from "react";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

function isValidSalonId(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    n >= 1 &&
    n <= MAGAZZINO_CENTRALE_ID
  );
}

export type MagazzinoContextKind = "central" | "warehouse_salon" | "reception" | "other";

export function useMagazzinoSalonContext() {
  const { role, activeSalonId, allowedSalons, isReady, receptionSalonId } =
    useActiveSalon();

  const isWarehouse = role === "magazzino" || role === "coordinator";
  const isReception = role === "reception";
  const isCentralHub =
    isWarehouse && isValidSalonId(activeSalonId) && activeSalonId === MAGAZZINO_CENTRALE_ID;

  const ctxSalonId: number | null = useMemo(() => {
    if (!isReady) return null;
    if (isWarehouse) {
      return isValidSalonId(activeSalonId) ? activeSalonId : MAGAZZINO_CENTRALE_ID;
    }
    return isValidSalonId(receptionSalonId) ? receptionSalonId : null;
  }, [isReady, isWarehouse, activeSalonId, receptionSalonId]);

  const salonName =
    ctxSalonId == null
      ? "—"
      : allowedSalons.find((s) => s.id === ctxSalonId)?.name ?? `Salone ${ctxSalonId}`;

  const contextKind: MagazzinoContextKind = isCentralHub
    ? "central"
    : isWarehouse
      ? "warehouse_salon"
      : isReception
        ? "reception"
        : "other";

  const contextLabel =
    ctxSalonId === MAGAZZINO_CENTRALE_ID ? "Magazzino Centrale" : salonName;

  const showMissingSalonBanner =
    isReady && !isWarehouse && !isValidSalonId(receptionSalonId);

  return {
    role,
    isReady,
    isWarehouse,
    isReception,
    isCentralHub,
    ctxSalonId,
    salonName,
    contextLabel,
    contextKind,
    showMissingSalonBanner,
    activeSalonId,
    receptionSalonId,
    allowedSalons,
  };
}
