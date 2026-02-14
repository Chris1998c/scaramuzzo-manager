"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  Home,
  Package,
  X,
  Users,
  CreditCard,
  FileText,
} from "lucide-react";
import { useUI } from "@/lib/ui-store";

type MenuItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
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
      { name: "In Sala", icon: Users, href: "/dashboard/in-sala" },
      { name: "Cassa", icon: CreditCard, href: "/dashboard/cassa" },
    ],
  },
  {
    title: "Gestione",
    items: [
      { name: "Clienti", icon: Users, href: "/dashboard/clienti" },
      { name: "Magazzino", icon: Package, href: "/dashboard/magazzino" },
      { name: "Report Cassa", icon: FileText, href: "/dashboard/report/cassa" },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, closeSidebar } = useUI();

  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) closeSidebar();
  };

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <motion.aside
          initial={{ x: -260 }}
          animate={{ x: 0 }}
          exit={{ x: -260 }}
          transition={{ type: "spring", stiffness: 240, damping: 22 }}
          className="fixed left-0 top-0 h-full w-72 z-50
          bg-scz-dark border-r border-scz-medium/40 p-6 flex flex-col shadow-xl"
        >
          {/* Close (mobile) */}
          <button
            onClick={closeSidebar}
            className="absolute right-4 top-4 p-2 rounded-xl bg-black/25 border border-white/10 hover:bg-black/35"
            aria-label="Chiudi menu"
            title="Chiudi"
          >
            <X size={18} className="text-white/80" />
          </button>

          {/* Brand */}
          <div className="flex items-center gap-3 mb-8 mt-2">
            <Image
              src="/logo-scaramuzzo.webp"
              width={42}
              height={42}
              alt="Scaramuzzo"
              className="rounded-2xl shadow-premium border border-white/10"
              priority
            />
            <div className="min-w-0">
              <div className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                Scaramuzzo
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-scz-gold leading-none">
                Manager
              </h1>
            </div>
          </div>

          {/* Menu */}
          <nav className="flex-1 flex flex-col gap-6">
            {sections.map((section) => (
              <div key={section.title}>
                <div className="text-[10px] font-black tracking-[0.25em] uppercase text-white/30 mb-2">
                  {section.title}
                </div>

                <div className="flex flex-col gap-1">
                  {section.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={handleNavClick}
                        className={[
                          "group relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl transition",
                          active
                            ? "bg-scz-medium/55 text-white border border-white/10"
                            : "text-scz-gold/85 hover:bg-scz-medium/30 border border-transparent hover:border-white/10",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            size={18}
                            className={[
                              "shrink-0",
                              active ? "text-[#f3d8b6]" : "text-[#f3d8b6]/70 group-hover:text-[#f3d8b6]",
                            ].join(" ")}
                          />
                          <span className="truncate text-sm font-bold">{item.name}</span>
                        </div>

                        {item.badge ? (
                          <span className="shrink-0 text-[10px] font-black tracking-wider px-2 py-1 rounded-xl bg-black/25 border border-white/10 text-white/70">
                            {item.badge}
                          </span>
                        ) : null}

                        {/* Active glow */}
                        {active ? (
                          <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-[#f3d8b6]/20 shadow-[0_10px_30px_rgba(243,216,182,0.08)]" />
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer mini */}
          <div className="pt-4 border-t border-white/5">
            <div className="text-[10px] text-white/35 font-bold">
              © Scaramuzzo Studio SRL
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
