"use client";

import { Suspense } from "react";
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
 if (pathname.startsWith("/dashboard/fiscale/bridge")) return "Bridge stampa";
 if (pathname.startsWith("/dashboard/fiscale")) return "Job fiscali";
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
 const { activeSalonId, allowedSalons, isReady, canChooseSalon } = useActiveSalon();
 const salonLabel =
 isReady && activeSalonId != null
 ? allowedSalons.find((s) => s.id === activeSalonId)?.name?.trim() ?? null
 : null;

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
 <header className="w-full h-14 md:h-16 bg-scz-dark border-b border-white/[0.06] px-3 md:px-6 flex items-center justify-between gap-3">
 <div className="flex items-center gap-3 md:gap-5 min-w-0 flex-1">
 <div className="min-w-0">
 <h2 className="text-base md:text-lg font-semibold text-[#f3d8b6] tracking-tight truncate">
 {title}
 </h2>
 {!canChooseSalon && salonLabel ? (
 <p className="text-[11px] text-white/45 truncate" title={salonLabel}>
 {salonLabel}
 </p>
 ) : null}
 </div>

 <div className="hidden md:flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
 <Suspense fallback={<span className="text-sm text-white/40">…</span>}>
 <SalonSwitcher />
 </Suspense>
 </div>
 </div>

 <div className="flex items-center gap-1.5 shrink-0">
 <button
 onClick={handleLogout}
 className="p-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 transition"
 aria-label="Esci"
 title="Esci"
 >
 <LogOut size={18} />
 </button>

 <button
 onClick={toggleSidebar}
 className="p-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 transition"
 aria-label="Menu"
 title="Menu"
 >
 <Menu size={18} />
 </button>
 </div>
 </header>
 );
}
