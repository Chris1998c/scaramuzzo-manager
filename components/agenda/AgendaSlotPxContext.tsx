"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { SLOT_PX_FALLBACK } from "./utils";

/** Densità verticale griglia in base alla larghezza viewport (allinea righe, box e drag). */
export function agendaSlotPxFromViewportWidth(width: number): number {
  if (width >= 1440) return 24;
  if (width >= 1024) return 26;
  return 30;
}

const AgendaSlotPxContext = createContext<number>(SLOT_PX_FALLBACK);

export function AgendaSlotPxProvider({ children }: { children: React.ReactNode }) {
  const [slotPx, setSlotPx] = useState(SLOT_PX_FALLBACK);

  useEffect(() => {
    const update = () => setSlotPx(agendaSlotPxFromViewportWidth(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <AgendaSlotPxContext.Provider value={slotPx}>{children}</AgendaSlotPxContext.Provider>
  );
}

export function useAgendaSlotPx(): number {
  return useContext(AgendaSlotPxContext);
}
