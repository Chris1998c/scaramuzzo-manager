"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const MAGAZZINO_CENTRALE_ID = 0;

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // SEMPRE number: 0 = magazzino centrale (vista aggregata)
  activeSalonId: number;
  setActiveSalonId: (id: number) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      closeSidebar: () => set({ sidebarOpen: false }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      activeSalonId: MAGAZZINO_CENTRALE_ID,
      setActiveSalonId: (id) =>
        set({ activeSalonId: Number.isFinite(id) ? Number(id) : MAGAZZINO_CENTRALE_ID }),
    }),
    {
      name: "scz-ui",
      partialize: (s) => ({
        sidebarOpen: s.sidebarOpen,
        activeSalonId: s.activeSalonId,
      }),
    }
  )
);
