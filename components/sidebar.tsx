"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  ClipboardList,
  Home,
  MessageCircle,
  Package,
  X,
  Users,
  UserSquare2,
  FileText,
  Receipt,
  Radio,
  Settings,
} from "lucide-react";
import { canAccessFiscalJobsWeb } from "@/lib/fiscalJobsWebAccessShared";
import { useUI } from "@/lib/ui-store";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { canAccessMarketingWeb } from "@/lib/marketingWebAccessShared";

type MenuItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  badge?: string;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

const sections: MenuSection[] = [
  {
    title: "Operativo",
    items: [
      { name: "Dashboard", icon: Home, href: "/dashboard" },
      { name: "Agenda", icon: CalendarDays, href: "/dashboard/agenda" },
      { name: "In sala", icon: UserSquare2, href: "/dashboard/in-sala" },
      { name: "Presenze", icon: ClipboardList, href: "/dashboard/presenze" },
    ],
  },
  {
    title: "Gestione",
    items: [
      { name: "Clienti", icon: Users, href: "/dashboard/clienti" },
      { name: "Magazzino", icon: Package, href: "/dashboard/magazzino" },
      { name: "WhatsApp manuale", icon: MessageCircle, href: "/dashboard/marketing" },
      { name: "Report", icon: FileText, href: "/dashboard/report" },
      { name: "Job fiscali", icon: Receipt, href: "/dashboard/fiscale" },
      { name: "Bridge stampa", icon: Radio, href: "/dashboard/fiscale/bridge" },
    ],
  },
  {
    title: "Sistema",
    items: [{ name: "Impostazioni", icon: Settings, href: "/dashboard/impostazioni" }],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, closeSidebar } = useUI();

  const { role, isReady, activeSalonId, allowedSalons } = useActiveSalon();

  const salonDisplayName = useMemo(() => {
    if (!isReady) return null;
    if (activeSalonId == null) return null;
    return allowedSalons.find((s) => s.id === activeSalonId)?.name?.trim() || null;
  }, [isReady, activeSalonId, allowedSalons]);

  const isCliente = isReady && role === "cliente";
  const isCoordinator = isReady && role === "coordinator";
  const isReception = isReady && role === "reception";
  const isStaffNotCliente = isReady && role !== "cliente";
  const canSeeCrmAndMarketing = isReady && canAccessMarketingWeb(role);
  const canSeePresenze = isCoordinator || isReception;
  const canSeeFiscalJobs = isReady && canAccessFiscalJobsWeb(role);

  const visibleSections = useMemo(() => {
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter((it) => {
          if (isCliente) {
            return it.href === "/dashboard";
          }
          if (it.href === "/dashboard/report") return isCoordinator;
          if (it.href === "/dashboard/fiscale") return canSeeFiscalJobs;
          if (it.href === "/dashboard/fiscale/bridge") return canSeeFiscalJobs;
          if (it.href === "/dashboard/marketing") return canSeeCrmAndMarketing;
          if (it.href === "/dashboard/presenze") return canSeePresenze;
          if (it.href === "/dashboard/clienti") return canSeeCrmAndMarketing;
          if (it.href === "/dashboard/magazzino") return isStaffNotCliente;
          if (it.href === "/dashboard/agenda") return isStaffNotCliente;
          if (it.href === "/dashboard/in-sala") return isStaffNotCliente;
          if (it.href === "/dashboard/impostazioni") return isStaffNotCliente;
          return true;
        }),
      }))
      .filter((s) => s.items.length > 0);
  }, [
    isCliente,
    isCoordinator,
    canSeeCrmAndMarketing,
    isStaffNotCliente,
    canSeePresenze,
    canSeeFiscalJobs,
  ]);

  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) closeSidebar();
  };

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <motion.aside
          initial={{ x: -280, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -280, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="fixed left-2 right-2 sm:left-3 sm:right-auto top-3 bottom-3 z-50 w-auto sm:w-[17.25rem] flex flex-col pointer-events-none"
        >
          <div
            className="pointer-events-auto flex flex-col h-full rounded-[1.35rem] sidebar-glass
            border border-white/[0.08] shadow-sidebar-float overflow-hidden"
          >
            {/* Bronze edge glow */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-scz-gold/35 to-transparent"
              aria-hidden
            />

            <div className="relative flex flex-col h-full p-5">
              {/* Close (mobile) */}
              <button
                onClick={closeSidebar}
                className="lg:hidden absolute right-3.5 top-3.5 p-2 rounded-xl bg-black/30 border border-white/[0.08]
                hover:bg-black/45 hover:border-white/15 transition-premium"
                aria-label="Chiudi menu"
                title="Chiudi"
              >
                <X size={17} className="text-white/75" strokeWidth={2} />
              </button>

              {/* Brand */}
              <div className="flex items-center gap-3.5 mb-6 mt-0.5 pr-8 lg:pr-0">
                <div className="relative shrink-0">
                  <div
                    className="absolute -inset-1 rounded-[1.1rem] bg-scz-gold/15 blur-md opacity-70"
                    aria-hidden
                  />
                  <Image
                    src="/logo-scaramuzzo.webp"
                    width={44}
                    height={44}
                    alt="Scaramuzzo"
                    className="relative rounded-[1.1rem] shadow-premium border border-white/12"
                    priority
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-[1.35rem] font-extrabold tracking-tight text-scz-gold leading-none">
                    Manager
                  </h1>
                  <p className="text-[10px] font-semibold text-white/40 mt-1 tracking-wide">
                    Scaramuzzo Studio
                  </p>
                </div>
              </div>

              {/* Salon badge */}
              <div className="mb-7">
                {salonDisplayName ? (
                  <div
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-scz-gold/25
                    bg-gradient-to-r from-scz-gold/[0.12] to-scz-gold/[0.04] px-3 py-1.5 shadow-bronze-glow"
                    title={salonDisplayName}
                  >
                    <span
                      className="shrink-0 w-1.5 h-1.5 rounded-full bg-scz-gold shadow-[0_0_8px_rgba(197,165,114,0.55)]"
                      aria-hidden
                    />
                    <span className="truncate text-[11px] font-bold text-[#f3d8b6]/95 tracking-wide">
                      {salonDisplayName}
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/25 px-3 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/25 animate-pulse" aria-hidden />
                    <span className="text-[11px] font-semibold text-white/40">
                      {!isReady ? "Caricamento salone…" : "Nessun salone attivo"}
                    </span>
                  </div>
                )}
              </div>

              {/* Menu */}
              <nav className="flex-1 flex flex-col gap-7 overflow-y-auto overflow-x-hidden pr-0.5 -mr-0.5">
                {visibleSections.map((section, sectionIdx) => (
                  <div key={section.title}>
                    {sectionIdx > 0 ? (
                      <div
                        className="mb-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
                        aria-hidden
                      />
                    ) : null}
                    <div className="text-[9px] font-bold tracking-[0.22em] uppercase text-white/28 mb-2.5 pl-1">
                      {section.title}
                    </div>

                    <div className="flex flex-col gap-0.5">
                      {section.items.map((item) => {
                        const active = isActivePath(pathname, item.href);
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={handleNavClick}
                            className={[
                              "group relative flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl transition-premium",
                              active ? "text-white" : "text-white/55 hover:text-white/85",
                            ].join(" ")}
                          >
                            {active ? (
                              <motion.span
                                layoutId="sidebarActivePill"
                                className="absolute inset-0 rounded-xl bg-white/[0.07] border border-white/[0.1]
                                shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_8px_24px_-8px_rgba(0,0,0,0.5)]"
                                transition={{
                                  type: "spring",
                                  stiffness: 420,
                                  damping: 36,
                                }}
                              />
                            ) : null}

                            <div className="relative z-10 flex items-center gap-3 min-w-0">
                              <span
                                className={[
                                  "flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-premium",
                                  active
                                    ? "bg-scz-gold/15 text-[#f3d8b6]"
                                    : "bg-transparent text-[#f3d8b6]/55 group-hover:bg-white/[0.04] group-hover:text-[#f3d8b6]/85",
                                ].join(" ")}
                              >
                                <Icon size={17} strokeWidth={active ? 2.25 : 1.85} />
                              </span>
                              <span
                                className={[
                                  "truncate text-[13px] transition-premium",
                                  active ? "font-bold" : "font-semibold group-hover:font-bold",
                                ].join(" ")}
                              >
                                {item.name}
                              </span>
                            </div>

                            {item.badge ? (
                              <span
                                className="relative z-10 shrink-0 text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-md
                                bg-black/30 border border-white/[0.08] text-white/60"
                              >
                                {item.badge}
                              </span>
                            ) : null}

                            {active ? (
                              <span
                                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full
                                bg-gradient-to-b from-scz-gold/80 to-scz-gold/30 shadow-[0_0_10px_rgba(197,165,114,0.35)]"
                                aria-hidden
                              />
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              {/* Footer */}
              <div className="pt-5 mt-2 border-t border-white/[0.06]">
                <div className="text-[10px] text-white/30 font-medium tracking-wide">
                  © Scaramuzzo Studio SRL
                </div>
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
