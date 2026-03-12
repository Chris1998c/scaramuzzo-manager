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
  Users,
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

  const today = toYmd(new Date());
  const spDate = sp.get("date");
  const currentDate = spDate && /^\d{4}-\d{2}-\d{2}$/.test(spDate) ? spDate : today;
  const highlightAppointmentId = sp.get("highlight") ?? null;

  const [calendarOpen, setCalendarOpen] = useState(false);

  function setDate(next: string) {
    const params = new URLSearchParams(sp.toString()); // ✅ preserva eventuali altri param
    params.set("date", next);
    router.replace(`/dashboard/agenda?${params.toString()}`, { scroll: false });
  }

  function clearHighlightParam() {
    if (!highlightAppointmentId) return;
    const params = new URLSearchParams(sp.toString());
    params.delete("highlight");
    const qs = params.toString();
    router.replace(qs ? `/dashboard/agenda?${qs}` : "/dashboard/agenda", { scroll: false });
  }

  if (!isReady) return <AgendaPageSkeleton />;

  const activeSalonName = allowedSalons.find((s) => s.id === activeSalonId)?.name?.split(" - ")[0] ?? null;

  return (
    <div className="w-full h-screen flex flex-col space-y-4 overflow-hidden pb-4">
      {/* TOP AREA — Header + Control bar */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)] shrink-0">
        <div className="border-b border-white/10 bg-black/20 px-4 md:px-6 py-4">
          <h1 className="text-2xl md:text-3xl font-black text-[#f3d8b6] tracking-tight">
            Agenda
          </h1>
          <p className="mt-1 text-sm text-white/50">
            {activeSalonName ? `${activeSalonName} · ` : ""}
            {formatPretty(currentDate)}
          </p>
        </div>
        <div className="px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setDate(today)}
              className="h-11 px-4 rounded-xl bg-[#f3d8b6] text-black font-black text-[10px] uppercase tracking-wider hover:opacity-95 transition-opacity"
            >
              Oggi
            </button>
            <div className="flex items-center rounded-xl border border-white/10 bg-black/20 overflow-hidden">
              <button
                type="button"
                onClick={() => setDate(addDays(currentDate, -1))}
                className="p-2.5 text-white/70 hover:bg-white/10 hover:text-[#f3d8b6] transition-colors"
                aria-label="Giorno precedente"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-[130px] px-3 py-2 text-center border-x border-white/10">
                <span className="text-[11px] font-bold text-[#f3d8b6] uppercase tracking-tight">
                  {formatPretty(currentDate)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDate(addDays(currentDate, 1))}
                className="p-2.5 text-white/70 hover:bg-white/10 hover:text-[#f3d8b6] transition-colors"
                aria-label="Giorno successivo"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="flex items-center rounded-xl border border-white/10 bg-black/20 p-0.5">
              <button
                type="button"
                onClick={() => setDate(addDays(currentDate, -7))}
                className="p-2 text-white/50 hover:text-[#f3d8b6] hover:bg-white/5 rounded-lg transition-colors"
                aria-label="Settimana precedente"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setDate(addDays(currentDate, 7))}
                className="p-2 text-white/50 hover:text-[#f3d8b6] hover:bg-white/5 rounded-lg transition-colors"
                aria-label="Settimana successiva"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard/in-sala")}
              className="h-11 px-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-bold text-[10px] uppercase tracking-wider hover:bg-emerald-500/20 transition-colors flex items-center gap-2"
            >
              <Users size={14} />
              In sala
            </button>
            <div className="relative">
              <Store size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              <select
                value={activeSalonId || ""}
                onChange={(e) => setActiveSalonId(Number(e.target.value))}
                className="h-11 pl-9 pr-8 rounded-xl border border-white/10 bg-black/30 text-white/90 font-bold text-[11px] appearance-none outline-none focus:ring-2 focus:ring-[#f3d8b6]/30 focus:border-[#f3d8b6]/40 cursor-pointer"
              >
                {allowedSalons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.split(" - ")[0]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="h-11 w-11 rounded-xl border border-white/10 bg-black/30 text-white/70 hover:bg-white/10 hover:text-[#f3d8b6] transition-colors flex items-center justify-center shrink-0"
              aria-label="Scegli data"
            >
              <Calendar size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-scz-darker/50 overflow-hidden">
        <AgendaGrid
          currentDate={currentDate}
          highlightAppointmentId={highlightAppointmentId}
          onHighlightHandled={clearHighlightParam}
        />
      </div>

      <CalendarModal
        isOpen={calendarOpen}
        close={() => setCalendarOpen(false)}
        onSelectDate={(d) => setDate(d)}  // ✅ aggiorna URL, no state
      />
    </div>
  );
}

function AgendaPageSkeleton() {
  return (
    <div className="w-full flex flex-col space-y-4 animate-pulse">
      <div className="h-[140px] rounded-2xl bg-scz-dark border border-white/10 shrink-0" />
      <div className="flex-1 min-h-[400px] rounded-xl bg-scz-darker/50 border border-white/10" />
    </div>
  );
}
