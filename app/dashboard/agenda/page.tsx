"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import AgendaGrid from "@/components/agenda/AgendaGrid";
import CalendarModal from "@/components/agenda/CalendarModal";

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
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** ✅ Wrapper required by Next.js when using useSearchParams() */
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

  const initialDate = useMemo(() => {
    const q = sp.get("date");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    return toYmd(new Date());
  }, [sp]);

  const [currentDate, setCurrentDate] = useState<string>(initialDate);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // URL always in sync (refresh/share safe)
  useEffect(() => {
    router.replace(`/dashboard/agenda?date=${encodeURIComponent(currentDate)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  return (
    <div className="w-full space-y-6">
      {/* HERO */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[#5c3a21]/50 bg-[#24140e]/60 p-5 md:p-7 backdrop-blur-md shadow-[0_0_60px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-2xl p-3 bg-black/20 border border-[#5c3a21]/60">
            <CalendarDays className="text-[#f3d8b6]" size={26} strokeWidth={1.7} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                  Agenda
                </h1>
                <p className="text-[#c9b299] mt-2 max-w-2xl">
                  Week view, creazione/modifica e chiusura. Veloce per reception e staff, UX moderna.
                </p>

                <div className="mt-4 text-sm text-[#c9b299]">
                  Data selezionata:{" "}
                  <span className="text-[#f3d8b6] font-semibold capitalize">
                    {formatPretty(currentDate)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 lg:justify-end">
                <button
                  onClick={() => setCalendarOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3
                    bg-[#0FA958] text-white font-semibold
                    shadow-[0_10px_35px_rgba(15,169,88,0.25)]
                    hover:scale-[1.02] transition"
                >
                  Calendario <ArrowRight size={18} />
                </button>

                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3
                    bg-black/20 border border-[#5c3a21]/60 text-[#f3d8b6]
                    hover:border-[var(--accent)] transition"
                >
                  Dashboard
                </Link>
              </div>
            </div>

            {/* TOOLBAR */}
            <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setCurrentDate(toYmd(new Date()))}
                  className="rounded-2xl px-4 py-2 bg-black/25 border border-[#5c3a21]/60 text-[#f3d8b6]
                    hover:bg-black/30 transition"
                >
                  Oggi
                </button>

                <button
                  onClick={() => setCalendarOpen(true)}
                  className="rounded-2xl px-4 py-2 bg-[#f3d8b6] text-[#1A0F0A] font-extrabold
                    hover:opacity-90 transition inline-flex items-center gap-2"
                >
                  <CalendarDays size={18} />
                  Seleziona data
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* prev/next day */}
                <div className="flex items-center rounded-2xl bg-black/20 border border-[#5c3a21]/60 p-1">
                  <button
                    onClick={() => setCurrentDate(addDays(currentDate, -1))}
                    className="p-2 rounded-xl hover:bg-black/25 transition text-[#f3d8b6]"
                    aria-label="Giorno precedente"
                    title="Giorno precedente"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setCurrentDate(addDays(currentDate, 1))}
                    className="p-2 rounded-xl hover:bg-black/25 transition text-[#f3d8b6]"
                    aria-label="Giorno successivo"
                    title="Giorno successivo"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                {/* prev/next week */}
                <div className="flex items-center rounded-2xl bg-black/20 border border-[#5c3a21]/60 p-1">
                  <button
                    onClick={() => setCurrentDate(addDays(currentDate, -7))}
                    className="p-2 rounded-xl hover:bg-black/25 transition text-[#f3d8b6]"
                    aria-label="Settimana precedente"
                    title="Settimana precedente"
                  >
                    <ChevronsLeft size={18} />
                  </button>
                  <button
                    onClick={() => setCurrentDate(addDays(currentDate, 7))}
                    className="p-2 rounded-xl hover:bg-black/25 transition text-[#f3d8b6]"
                    aria-label="Settimana successiva"
                    title="Settimana successiva"
                  >
                    <ChevronsRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* GRID */}
      <div className="rounded-3xl border border-[#5c3a21]/50 bg-[#24140e]/40 p-4 md:p-6 backdrop-blur-md">
        <div className="rounded-2xl bg-black/15 border border-[#5c3a21]/50 p-2 md:p-3 overflow-hidden">
          <AgendaGrid currentDate={currentDate} />
        </div>
      </div>

      {/* CALENDAR MODAL */}
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
    <div className="w-full space-y-6">
      <div className="rounded-3xl border border-[#5c3a21]/50 bg-[#24140e]/60 p-5 md:p-7">
        <div className="h-6 w-40 bg-black/20 rounded-xl" />
        <div className="mt-3 h-4 w-72 bg-black/20 rounded-xl" />
        <div className="mt-5 h-10 w-full bg-black/15 rounded-2xl" />
      </div>

      <div className="rounded-3xl border border-[#5c3a21]/50 bg-[#24140e]/40 p-4 md:p-6">
        <div className="h-[520px] w-full bg-black/15 rounded-2xl border border-[#5c3a21]/40" />
      </div>
    </div>
  );
}
