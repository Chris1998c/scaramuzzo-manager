"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type RoleName = "coordinator" | "reception" | "magazzino" | "cliente";

export type AllowedSalon = { id: number; name: string };

type ActiveSalonContextValue = {
  role: RoleName;
  activeSalonId: number | null;          // SEMPRE un solo salone
  canChooseSalon: boolean;               // solo coordinator
  allowedSalonIds: number[];             // lista consentita
  allowedSalons: AllowedSalon[];         // id + name (per la select)
  setActiveSalonId: (id: number) => void;
  isReady: boolean;
};

const ActiveSalonContext = createContext<ActiveSalonContextValue | null>(null);

export function useActiveSalon() {
  const ctx = useContext(ActiveSalonContext);
  if (!ctx) throw new Error("useActiveSalon must be used within ActiveSalonProvider");
  return ctx;
}

type Props = {
  children: React.ReactNode;
  role: RoleName;
  allowedSalonIds: number[];
  allowedSalons: AllowedSalon[];
  defaultSalonId?: number | null;
};

export function ActiveSalonProvider({
  children,
  role,
  allowedSalonIds,
  allowedSalons,
  defaultSalonId = null,
}: Props) {
  const canChooseSalon = role === "coordinator";

  // reception/magazzino: salone forzato = primo consentito
  const forcedSalonId = !canChooseSalon ? (allowedSalonIds[0] ?? null) : null;

  const [activeSalonId, _setActiveSalonId] = useState<number | null>(
    forcedSalonId ?? defaultSalonId ?? (allowedSalonIds[0] ?? null)
  );
  const [isReady, setIsReady] = useState(false);

  // init / re-init quando cambiano permessi
  useEffect(() => {
    if (!canChooseSalon) {
      _setActiveSalonId(forcedSalonId);
      setIsReady(true);
      return;
    }

    const saved = window.localStorage.getItem("sm_activeSalonId");
    const savedNum = saved ? Number(saved) : NaN;

    let initial: number | null = null;

    if (Number.isFinite(savedNum) && allowedSalonIds.includes(savedNum)) {
      initial = savedNum;
    } else if (defaultSalonId != null && allowedSalonIds.includes(defaultSalonId)) {
      initial = defaultSalonId;
    } else {
      initial = allowedSalonIds[0] ?? null;
    }

    _setActiveSalonId(initial);
    setIsReady(true);
  }, [canChooseSalon, forcedSalonId, defaultSalonId, allowedSalonIds]);

  // se activeSalonId diventa non valido (es. permessi cambiati), fallback
  useEffect(() => {
    if (!isReady) return;
    const effective = forcedSalonId ?? activeSalonId;
    if (effective == null) return;

    if (!allowedSalonIds.includes(effective)) {
      const fallback = forcedSalonId ?? (allowedSalonIds[0] ?? null);
      _setActiveSalonId(fallback);
      if (canChooseSalon && fallback != null) {
        window.localStorage.setItem("sm_activeSalonId", String(fallback));
      }
    }
  }, [isReady, activeSalonId, forcedSalonId, allowedSalonIds, canChooseSalon]);

  const setActiveSalonId = (id: number) => {
    if (!canChooseSalon) return;                 // reception/magazzino non cambiano
    if (!allowedSalonIds.includes(id)) return;   // guardrail

    _setActiveSalonId(id);
    window.localStorage.setItem("sm_activeSalonId", String(id));
  };

  const value = useMemo<ActiveSalonContextValue>(
    () => ({
      role,
      activeSalonId: forcedSalonId ?? activeSalonId,
      canChooseSalon,
      allowedSalonIds,
      allowedSalons,
      setActiveSalonId,
      isReady,
    }),
    [role, activeSalonId, forcedSalonId, canChooseSalon, allowedSalonIds, allowedSalons, isReady]
  );

  return <ActiveSalonContext.Provider value={value}>{children}</ActiveSalonContext.Provider>;
}
