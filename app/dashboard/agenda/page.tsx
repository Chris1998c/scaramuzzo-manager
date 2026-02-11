"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
  Store,
  LayoutDashboard,
  Users
} from "lucide-react";

import AgendaGrid from "@/components/agenda/AgendaGrid";
import CalendarModal from "@/components/agenda/CalendarModal";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

// Utility per date
function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(ymd: string, delta: number) {
  const base = new Date(`${ymd}T00:00:00`);
  base.setDate(base.getDate() + delta);
  return toYmd(base);
}

function formatPretty(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function AgendaPage() {
  return (
    <Suspense fallback={<AgendaPageSkeleton />}>
      <AgendaPageInner />
    </Suspense>
  );
}

function AgendaPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { allowedSalons, activeSalonId, setActiveSalonId, isReady } = useActiveSalon();

  const [currentDate, setCurrentDate] = useState<string>(
    sp.get("date") || toYmd(new Date())
  );
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Sincronizzazione URL fluida
  useEffect(() => {
    const params = new URLSearchParams(sp.toString());
    params.set("date", currentDate);
    router.replace(`/dashboard/agenda?${params.toString()}`, { scroll: false });
  }, [currentDate]);

  if (!isReady) return <AgendaPageSkeleton />;

  return (
    <div className="w-full h-screen flex flex-col space-y-2 overflow-hidden pb-4">
      
      {/* TOOLBAR SUPER SLIM - Ispirata a Goweb ma con stile */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1c110d]/90 backdrop-blur-md border border-[#5c3a21]/50 p-2 rounded-xl shadow-lg">
        
        {/* Gruppo Navigazione: Oggi + Frecce + Data */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentDate(toYmd(new Date()))}
            className="px-3 py-1.5 bg-[#f3d8b6] hover:bg-[#e2c7a5] text-black text-[10px] font-black rounded-lg transition-all"
          >
            OGGI
          </button>

          <div className="flex items-center bg-black/40 border border-[#5c3a21]/50 rounded-lg p-0.5">
            <button onClick={() => setCurrentDate(addDays(currentDate, -1))} className="p-1 hover:bg-[#f3d8b6]/10 text-[#f3d8b6] rounded-md"><ChevronLeft size={16} /></button>
            <div className="px-2 min-w-[120px] text-center">
              <span className="text-[11px] font-bold text-[#f3d8b6] uppercase tracking-tighter">
                {formatPretty(currentDate)}
              </span>
            </div>
            <button onClick={() => setCurrentDate(addDays(currentDate, 1))} className="p-1 hover:bg-[#f3d8b6]/10 text-[#f3d8b6] rounded-md"><ChevronRight size={16} /></button>
          </div>

          <div className="flex items-center gap-1 bg-black/20 rounded-lg p-0.5 border border-[#5c3a21]/30">
            <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="p-1 text-[#f3d8b6]/50 hover:text-[#f3d8b6]"><ChevronsLeft size={14} /></button>
            <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-1 text-[#f3d8b6]/50 hover:text-[#f3d8b6]"><ChevronsRight size={14} /></button>
          </div>
        </div>

        {/* Gruppo Azioni: In Sala + Salone + Calendario */}
        <div className="flex items-center gap-2">
          
          {/* Tasto In Sala - Fondamentale per te */}
          <button 
            onClick={() => router.push('/dashboard/in-sala')}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#0FA958]/20 hover:bg-[#0FA958]/30 border border-[#0FA958]/40 rounded-lg text-[10px] font-black text-[#0FA958] transition-all"
          >
            <Users size={14} />
            IN SALA
          </button>

          {/* Selettore Salone - Ridotto all'osso */}
          <div className="relative">
            <Store size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#f3d8b6]/40" />
            <select
              value={activeSalonId || ""}
              onChange={(e) => setActiveSalonId(Number(e.target.value))}
              className="pl-7 pr-6 py-1.5 bg-black/40 border border-[#5c3a21]/60 rounded-lg text-[#f3d8b6] font-bold text-[10px] appearance-none outline-none focus:ring-1 focus:ring-[#f3d8b6]/30 transition cursor-pointer"
            >
              {allowedSalons.map((s) => (
                <option key={s.id} value={s.id}>{s.name.split(' - ')[0]}</option>
              ))}
            </select>
          </div>

          <button onClick={() => setCalendarOpen(true)} className="p-1.5 bg-[#f3d8b6]/10 hover:bg-[#f3d8b6]/20 text-[#f3d8b6] border border-[#f3d8b6]/30 rounded-lg transition-all">
            <Calendar size={16} />
          </button>
        </div>
      </div>

      {/* AREA GRID: Niente più card giganti, solo l'agenda */}
      <div className="flex-1 bg-[#140b07]/40 rounded-xl border border-[#5c3a21]/45 overflow-hidden shadow-2xl">
        <AgendaGrid currentDate={currentDate} />
      </div>

      <CalendarModal
        isOpen={calendarOpen}
        close={() => setCalendarOpen(false)}
        onSelectDate={(d) => setCurrentDate(d)}
      />
    </div>
  );
}
function AgendaPageSkeleton() {
  return (
    <div className="w-full space-y-4 animate-pulse">
      <div className="h-16 rounded-2xl bg-[#24140e]/60 border border-[#5c3a21]/50" />
      <div className="h-[600px] rounded-3xl bg-[#24140e]/40 border border-[#5c3a21]/50" />
    </div>
  );
}