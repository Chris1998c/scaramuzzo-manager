"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { CalendarDays, Home, Package, X } from "lucide-react";
import { useUI } from "@/lib/ui-store";

type MenuItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const menu: MenuItem[] = [
  { name: "Dashboard", icon: Home, href: "/dashboard" },
  { name: "Agenda", icon: CalendarDays, href: "/dashboard/agenda" },
  { name: "Magazzino", icon: Package, href: "/dashboard/magazzino" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, closeSidebar } = useUI();

  // Chiude la sidebar SOLO su schermi piccoli (mobile/tablet)
  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      closeSidebar();
    }
  };

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
          {/* Close Button (utile su mobile) */}
          <button
            onClick={closeSidebar}
            className="absolute right-4 top-4 p-2 rounded-lg bg-scz-medium/40 hover:bg-scz-medium/60"
            aria-label="Chiudi menu"
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
              priority
            />
            <h1 className="text-xl font-semibold tracking-tight text-scz-gold">
              Manager
            </h1>
          </div>

          {/* Menu */}
          <nav className="flex-1 flex flex-col gap-1">
            {menu.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={handleNavClick}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition
                  ${
                    active
                      ? "bg-scz-medium/50 text-white"
                      : "text-scz-gold/80 hover:bg-scz-medium/30"
                  }`}
                >
                  <Icon size={18} className="relative z-10" />
                  <span className="relative z-10">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
