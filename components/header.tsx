"use client";

import { Menu, LogOut } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useRouter, usePathname } from "next/navigation";
import SalonSwitcher from "@/components/SalonSwitcher";

function getTitleFromPath(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.startsWith("/dashboard/agenda")) return "Agenda";
  if (pathname === "/dashboard/magazzino") return "Magazzino";
  if (pathname.startsWith("/dashboard/magazzino/inventario")) return "Inventario";
  if (pathname.startsWith("/dashboard/magazzino/carico")) return "Carico";
  if (pathname.startsWith("/dashboard/magazzino/scarico")) return "Scarico";
  if (pathname.startsWith("/dashboard/magazzino/rapida")) return "Scarico rapido";
  if (pathname.startsWith("/dashboard/magazzino/trasferimenti")) return "Trasferimenti";
  if (pathname.startsWith("/dashboard/magazzino/movimenti")) return "Movimenti";
  if (pathname.startsWith("/dashboard/magazzino/nuovo-prodotto")) return "Nuovo prodotto";
  return "Scaramuzzo Manager";
}

export default function Header() {
  const { toggleSidebar } = useUI();
  const router = useRouter();
  const pathname = usePathname();
  const title = getTitleFromPath(pathname);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="w-full h-20 bg-scz-dark border-b border-scz-medium/40 px-4 md:px-8 flex items-center justify-between shadow-premium">
      {/* LEFT */}
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        <h2 className="text-xl md:text-2xl font-semibold text-white tracking-tight truncate">
          {title}
        </h2>

        {/* SALON SWITCHER (solo coordinator, gestito dal provider) */}
        <div className="hidden md:flex items-center gap-2">
          <span className="text-sm text-white/70">Vista:</span>
          <SalonSwitcher />
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
