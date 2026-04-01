"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

export type RoleName = "coordinator" | "reception" | "magazzino" | "cliente";
export type AllowedSalon = { id: number; name: string };

type ActiveSalonContextValue = {
  role: RoleName;
  activeSalonId: number | null;          // salone attivo (es. 5 centrale o 1..4)
  canChooseSalon: boolean;               // coordinator + magazzino
  allowedSalonIds: number[];             // lista consentita
  allowedSalons: AllowedSalon[];         // id + name (per la select)
  /** Per reception: salone da staff.salon_id (source of truth, stesso usato dalle API). Null per altri ruoli o se non in staff. */
  receptionSalonId: number | null;
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
  /** Da getUserAccess: staff.salon_id. Usato dalle pagine reception come source of truth (allineato alle API). */
  staffSalonId?: number | null;
};

function pickDefaultSalonId(allowedSalonIds: number[], fallback?: number | null) {
  // Preferisci sempre il MAGAZZINO_CENTRALE_ID se presente
  if (allowedSalonIds.includes(MAGAZZINO_CENTRALE_ID)) return MAGAZZINO_CENTRALE_ID;
  if (fallback != null && allowedSalonIds.includes(fallback)) return fallback;
  return allowedSalonIds[0] ?? null;
}

export function ActiveSalonProvider({
  children,
  role,
  allowedSalonIds,
  allowedSalons,
  defaultSalonId = null,
  staffSalonId = null,
}: Props) {
  // ✅ MAGAZZINO + COORDINATOR possono cambiare salone
  const canChooseSalon = role === "coordinator" || role === "magazzino";

  // ✅ Reception: salone operativo = staffSalonId (stesso usato da getUserAccess e API es. porta-in-sala), non allowedSalonIds[0].
  // ✅ Cliente: primo salone consentito come prima.
  const forcedSalonId = !canChooseSalon
    ? role === "reception"
      ? (staffSalonId ?? allowedSalonIds[0] ?? null)
      : (allowedSalonIds[0] ?? null)
    : null;

  const [activeSalonId, _setActiveSalonId] = useState<number | null>(() => {
    // init sync (no localStorage in init)
    return forcedSalonId ?? pickDefaultSalonId(allowedSalonIds, defaultSalonId);
  });

  const [isReady, setIsReady] = useState(false);

  // init / re-init quando cambiano ruolo/permessi
  useEffect(() => {
    // reception/cliente: sempre forzato
    if (!canChooseSalon) {
      _setActiveSalonId(forcedSalonId);
      setIsReady(true);
      return;
    }

    // coordinator/magazzino: prova a ripristinare da localStorage
    const saved = window.localStorage.getItem("sm_activeSalonId");
    const savedNum = saved ? Number(saved) : NaN;

    let initial: number | null = null;

    if (Number.isFinite(savedNum) && allowedSalonIds.includes(savedNum)) {
      initial = savedNum;
    } else if (defaultSalonId != null && allowedSalonIds.includes(defaultSalonId)) {
      initial = defaultSalonId;
    } else {
      initial = pickDefaultSalonId(allowedSalonIds, defaultSalonId);
    }

    _setActiveSalonId(initial);
    setIsReady(true);
  }, [canChooseSalon, forcedSalonId, defaultSalonId, allowedSalonIds]);

  // se activeSalonId diventa non valido (permessi cambiati), fallback
  useEffect(() => {
    if (!isReady) return;

    const effective = forcedSalonId ?? activeSalonId;
    if (effective == null) return;

    if (!allowedSalonIds.includes(effective)) {
      // Reception su staffSalonId: allineamento operativo anche se lista assegnazioni è incoerente (evita tornare al [0]).
      if (role === "reception" && staffSalonId != null && effective === staffSalonId) {
        return;
      }

      const fallback = forcedSalonId ?? pickDefaultSalonId(allowedSalonIds, defaultSalonId);
      _setActiveSalonId(fallback);

      // salva solo se può scegliere
      if (canChooseSalon && fallback != null) {
        window.localStorage.setItem("sm_activeSalonId", String(fallback));
      }
    }
  }, [isReady, activeSalonId, forcedSalonId, allowedSalonIds, canChooseSalon, defaultSalonId, role, staffSalonId]);

  const setActiveSalonId = (id: number) => {
    if (!canChooseSalon) return;                 // reception/cliente NON cambiano
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
      receptionSalonId: staffSalonId ?? null,
      setActiveSalonId,
      isReady,
    }),
    [role, activeSalonId, forcedSalonId, canChooseSalon, allowedSalonIds, allowedSalons, staffSalonId, isReady]
  );

  return <ActiveSalonContext.Provider value={value}>{children}</ActiveSalonContext.Provider>;
}
