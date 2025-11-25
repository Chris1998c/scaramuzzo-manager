"use client";

import { motion } from "framer-motion";
import {
  Home,
  Boxes,
  ArrowLeftRight,
  Truck,
  Users,
  BarChart3,
  Package2,
  LogOut,
} from "lucide-react";

export default function Dashboard() {
  const items = [
    {
      title: "Magazzino",
      desc: "Giacenze e prodotti",
      icon: <Boxes size={32} />,
      href: "/magazzino",
    },
    {
      title: "Movimenti",
      desc: "Entrate / Uscite",
      icon: <ArrowLeftRight size={32} />,
      href: "/movimenti",
    },
    {
      title: "Trasferimenti",
      desc: "Tra saloni",
      icon: <Truck size={32} />,
      href: "/trasferimenti",
    },
    {
      title: "Prodotti",
      desc: "Catalogo completo",
      icon: <Package2 size={32} />,
      href: "/prodotti",
    },
    {
      title: "Report",
      desc: "Statistiche dettagliate",
      icon: <BarChart3 size={32} />,
      href: "/report",
    },
    {
      title: "Staff & Permessi",
      desc: "Ruoli utenti",
      icon: <Users size={32} />,
      href: "/staff",
    },
  ];

  return (
    <div className="min-h-screen flex bg-[#1b0d08] text-white">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#341A09]/90 border-r border-[#ffffff20] backdrop-blur-lg px-6 py-10 hidden md:flex flex-col justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-wide mb-10">
            Scaramuzzo Manager
          </h1>

          <nav className="space-y-4">
            <a href="/dashboard" className="flex items-center gap-3 text-orange-300">
              <Home size={20} /> Dashboard
            </a>
            <a href="/magazzino" className="flex items-center gap-3 text-neutral-300">
              <Boxes size={20} /> Magazzino
            </a>
            <a href="/movimenti" className="flex items-center gap-3 text-neutral-300">
              <ArrowLeftRight size={20} /> Movimenti
            </a>
            <a href="/trasferimenti" className="flex items-center gap-3 text-neutral-300">
              <Truck size={20} /> Trasferimenti
            </a>
            <a href="/prodotti" className="flex items-center gap-3 text-neutral-300">
              <Package2 size={20} /> Prodotti
            </a>
            <a href="/report" className="flex items-center gap-3 text-neutral-300">
              <BarChart3 size={20} /> Report
            </a>
            <a href="/staff" className="flex items-center gap-3 text-neutral-300">
              <Users size={20} /> Staff & Permessi
            </a>
          </nav>
        </div>

        <button className="flex items-center gap-3 text-red-400 hover:text-red-300 transition">
          <LogOut size={20} /> Logout
        </button>
      </aside>

      {/* MAIN AREA */}
      <main className="flex-1 p-6 md:p-12">
        <h2 className="text-3xl font-semibold mb-6">Dashboard Operativa</h2>

        {/* GRID CARD PREMIUM */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <motion.a
              key={i}
              href={item.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-[#2b160d] border border-[#ffffff20] rounded-2xl p-6
                         hover:bg-[#3a1c10] transition shadow-lg hover:shadow-xl
                         flex flex-col gap-4 cursor-pointer"
            >
              <div className="text-orange-400">{item.icon}</div>

              <div>
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="text-neutral-400 text-sm">{item.desc}</p>
              </div>
            </motion.a>
          ))}
        </div>
      </main>
    </div>
  );
}
