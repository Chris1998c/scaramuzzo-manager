"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { CalendarDays } from "lucide-react";

import {
  Home,
  Package,
  Users,
  ClipboardList,
  ArrowRightLeft,
  Settings,
  X,
} from "lucide-react";
import { useUI } from "@/lib/ui-store";

const menu = [
  { name: "Dashboard", icon: Home, href: "/dashboard" },
  { name: "Magazzino", icon: Package, href: "/dashboard/magazzino" },
  { name: "Prodotti", icon: ClipboardList, href: "/dashboard/prodotti" },
  { name: "Agenda", icon: CalendarDays, href: "/dashboard/agenda" },
  { name: "Trasferimenti", icon: ArrowRightLeft, href: "/dashboard/trasferimenti" },
  { name: "Collaboratori", icon: Users, href: "/dashboard/collaboratori" },
];

export default function Sidebar() {
  const path = usePathname();
  const { sidebarOpen, closeSidebar } = useUI();

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <motion.aside
          initial={{ x: -260 }}
          animate={{ x: 0 }}
          exit={{ x: -260 }}
          transition={{ type: "spring", stiffness: 240, damping: 22 }}
          className="fixed left-0 top-0 h-full w-64 z-50 
          bg-scz-dark border-r border-scz-medium/40 p-6 flex flex-col shadow-xl"
        >
          {/* Close Button Mobile */}
          <button
            onClick={closeSidebar}
            className="absolute right-4 top-4 p-2 rounded-lg bg-scz-medium/40 hover:bg-scz-medium/60"
          >
            <X size={20} className="text-white" />
          </button>

          {/* Logo */}
          <div className="flex items-center gap-3 mb-10 mt-2">
            <Image
              src="/logo-scaramuzzo.webp"
              width={42}
              height={42}
              alt="Scaramuzzo"
              className="rounded-xl shadow-premium"
            />
            <h1 className="text-xl font-semibold tracking-tight text-scz-gold">
              Manager
            </h1>
          </div>

          {/* Menu */}
          <nav className="flex-1 flex flex-col gap-1">
            {menu.map((item) => {
              const active = path === item.href;
              const Icon = item.icon;

              return (
                <Link
                  onClick={closeSidebar}
                  key={item.name}
                  href={item.href}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition
                  ${active ? "bg-scz-medium/50 text-white" : "text-scz-gold/80 hover:bg-scz-medium/30"}`}
                >
                  <Icon size={18} className="relative z-10" />
                  <span className="relative z-10">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Settings */}
          <div className="mt-auto pt-6 border-t border-scz-medium/40">
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-3 px-3 py-2 text-scz-gold/70 hover:text-white transition"
            >
              <Settings size={18} />
              Impostazioni
            </Link>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
