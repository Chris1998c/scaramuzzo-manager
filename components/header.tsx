"use client";

import { Suspense, useMemo } from "react";
import { Menu, LogOut } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { usePathname } from "next/navigation";
import SalonSwitcher from "@/components/SalonSwitcher";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

function getTitleFromPath(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.startsWith("/dashboard/agenda")) return "Agenda";
  if (pathname.startsWith("/dashboard/in-sala")) return "In sala";
  if (pathname.startsWith("/dashboard/presenze")) return "Presenze";
  if (pathname.startsWith("/dashboard/marketing")) return "WhatsApp manuale";
  if (pathname.startsWith("/dashboard/report")) return "Report & KPI";
  if (pathname.startsWith("/dashboard/clienti")) return "Clienti";
  if (pathname.startsWith("/dashboard/impostazioni")) return "Impostazioni";
  if (pathname.startsWith("/dashboard/cassa")) return "Check-out cassa";
  if (pathname === "/dashboard/magazzino") return "Magazzino";
  if (pathname.startsWith("/dashboard/magazzino/inventario")) return "Inventario";
  if (pathname.startsWith("/dashboard/magazzino/carico")) return "Carico";
  if (pathname.startsWith("/dashboard/magazzino/scarico")) return "Scarico";
  if (pathname.startsWith("/dashboard/magazzino/rapida")) return "Scarico rapido";
  if (pathname.startsWith("/dashboard/magazzino/trasferimenti")) return "Trasferimenti";
  if (pathname.startsWith("/dashboard/magazzino/movimenti")) return "Movimenti";
  if (pathname.startsWith("/dashboard/magazzino/nuovo-prodotto")) return "Nuovo prodotto";
  if (pathname.startsWith("/dashboard/magazzino/prodotto")) return "Prodotto";
  return "Scaramuzzo Manager";
}

export default function Header() {
  const { toggleSidebar } = useUI();
  const pathname = usePathname();
  const title = getTitleFromPath(pathname);
  const { activeSalonId, allowedSalons, isReady } = useActiveSalon();

  const salonBrandLine = useMemo(() => {
    if (!isReady) return "Scaramuzzo …";
    if (activeSalonId == null) return "Scaramuzzo —";
    const name = allowedSalons.find((s) => s.id === activeSalonId)?.name?.trim();
    return name ? `Scaramuzzo - ${name}` : "Scaramuzzo —";
  }, [isReady, activeSalonId, allowedSalons]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // continua: hard refresh comunque
    }
    try {
      await createClient().auth.signOut();
    } catch {
      // sessione client già assente o rete
    }
    window.location.href = "/login";
  }

  return (
    <header className="w-full h-20 bg-scz-dark border-b border-scz-medium/40 px-4 md:px-8 flex items-center justify-between shadow-premium">
      {/* LEFT */}
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        <div className="flex flex-col min-w-0 gap-0.5">
          <div
            className="text-xs md:text-sm font-semibold text-[#f3d8b6]/85 tracking-tight truncate"
            title={salonBrandLine}
          >
            {salonBrandLine}
          </div>
          <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight truncate">
            {title}
          </h2>
        </div>

        {/* SALON SWITCHER (solo coordinator/magazzino, gestito dal provider) */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <span className="text-sm text-white/70">Vista:</span>
          <Suspense fallback={<span className="text-sm text-white/40">…</span>}>
            <SalonSwitcher />
          </Suspense>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={handleLogout}
          className="p-3 rounded-xl bg-scz-medium/40 hover:bg-scz-medium/60 transition"
          aria-label="Logout"
          title="Logout"
        >
          <LogOut size={22} className="text-white" />
        </button>

        <button
          onClick={toggleSidebar}
          className="p-3 rounded-xl bg-scz-medium/40 hover:bg-scz-medium/60 transition"
          aria-label="Menu"
          title="Menu"
        >
          <Menu size={22} className="text-white" />
        </button>
      </div>
    </header>
  );
}
