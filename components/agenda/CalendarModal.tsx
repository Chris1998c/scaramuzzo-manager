"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  isOpen: boolean;
  close: () => void;
  onSelectDate: (date: string) => void;
  selectedDate?: string; // yyyy-mm-dd
}

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** parse robusto e stabile (estrae YYYY-MM-DD se presente) */
function parseTsSafe(ts: string) {
  const s = String(ts || "");
  const head = s.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? toYmd(d) : "";
}

function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function CalendarModal({
  isOpen,
  close,
  onSelectDate,
  selectedDate,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId } = useActiveSalon();

  const [currentMonth, setCurrentMonth] = useState(() => {
    const base = selectedDate ? new Date(`${selectedDate}T12:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const [appointmentsByDay, setAppointmentsByDay] = useState<Record<string, number>>(
    {}
  );

  // cache per evitare refetch continuo quando apri/chiudi o navighi avanti/indietro
  const cacheRef = useRef<Record<string, Record<string, number>>>({});
  const lastReqRef = useRef(0);

  // quando apri o cambia selectedDate, porta il mese su quello giusto
  useEffect(() => {
    if (!isOpen) return;
    if (!selectedDate) return;

    const d = new Date(`${selectedDate}T12:00:00`);
    if (!Number.isFinite(d.getTime())) return;

    setCurrentMonth((prev) => {
      const next = new Date(d.getFullYear(), d.getMonth(), 1);
      return prev.getFullYear() === next.getFullYear() && prev.getMonth() === next.getMonth()
        ? prev
        : next;
    });
  }, [isOpen, selectedDate]);

  // carica conteggi mese (solo quando aperto)
  useEffect(() => {
    if (!isOpen) return;
    if (activeSalonId == null) {
      setAppointmentsByDay({});
      return;
    }

    const mk = monthKey(currentMonth);
    const cacheKey = `${activeSalonId}-${mk}`;

    // cache hit
    const cached = cacheRef.current[cacheKey];
    if (cached) {
      setAppointmentsByDay(cached);
      return;
    }

    const reqId = ++lastReqRef.current;

    (async () => {
      const y = currentMonth.getFullYear();
      const m1 = currentMonth.getMonth() + 1; // 1..12
      const start = `${y}-${String(m1).padStart(2, "0")}-01T00:00:00`;

      const lastDay = new Date(y, m1, 0).getDate();
      const end = `${y}-${String(m1).padStart(2, "0")}-${String(lastDay).padStart(
        2,
        "0"
      )}T23:59:59`;

      const { data, error } = await supabase
        .from("appointments")
        .select("start_time")
        .eq("salon_id", Number(activeSalonId))
        .gte("start_time", start)
        .lte("start_time", end);

      // se nel frattempo hai cambiato mese/salone, ignora
      if (reqId !== lastReqRef.current) return;

      if (error) {
        console.error(error);
        setAppointmentsByDay({});
        return;
      }

      const grouped: Record<string, number> = {};
      for (const a of data || []) {
        const key = a?.start_time ? parseTsSafe(a.start_time) : "";
        if (!key) continue;
        grouped[key] = (grouped[key] || 0) + 1;
      }

      cacheRef.current[cacheKey] = grouped;
      setAppointmentsByDay(grouped);
    })();
  }, [isOpen, currentMonth, activeSalonId, supabase]);

  function changeMonth(offset: number) {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  function generateCalendarDays() {
    const y = currentMonth.getFullYear();
    const m0 = currentMonth.getMonth(); // 0..11

    const jsFirst = new Date(y, m0, 1).getDay(); // dom=0..sab=6
    const firstDay = jsFirst === 0 ? 7 : jsFirst; // lun=1..dom=7

    const daysInMonth = new Date(y, m0 + 1, 0).getDate();

    const days: Array<string | null> = [];
    for (let i = 1; i < firstDay; i++) days.push(null);

    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }

    // riempi fino a griglia intera (6 righe) per estetica stabile
    while (days.length % 7 !== 0) days.push(null);
    while (days.length < 42) days.push(null);

    return days;
  }

  if (!isOpen) return null;

  const monthName = currentMonth.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  const today = toYmd(new Date());
  const days = generateCalendarDays();

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] bg-black/65 backdrop-blur-sm p-4"
      onMouseDown={close}
    >
      <motion.div
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-2xl rounded-3xl border border-[#5c3a21]/60 bg-[#140b07]/85
                   shadow-[0_30px_90px_rgba(0,0,0,0.55)] overflow-hidden text-white"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#5c3a21]/50">
          <div className="min-w-0">
            <div className="text-xs text-[#f3d8b6]/70 tracking-wide">Calendario</div>
            <h2 className="text-2xl font-extrabold text-[#f3d8b6] tracking-tight mt-1 capitalize">
              {monthName}
            </h2>
          </div>

          <button
            onClick={close}
            className="rounded-2xl p-2 bg-black/25 border border-white/10 text-white/70 hover:bg-black/35 transition"
            aria-label="Chiudi"
            title="Chiudi"
          >
            <X size={18} />
          </button>
        </div>

        {/* NAV */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#5c3a21]/40">
          <button
            onClick={() => changeMonth(-1)}
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 bg-black/20 border border-[#5c3a21]/60 text-[#f3d8b6] hover:bg-black/30 transition"
          >
            <ChevronLeft size={18} />
            Mese prec.
          </button>

          <button
            onClick={() => setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="rounded-2xl px-4 py-2 bg-[#f3d8b6] text-[#1A0F0A] font-extrabold hover:opacity-90 transition"
          >
            Oggi
          </button>

          <button
            onClick={() => changeMonth(1)}
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 bg-black/20 border border-[#5c3a21]/60 text-[#f3d8b6] hover:bg-black/30 transition"
          >
            Mese succ.
            <ChevronRight size={18} />
          </button>
        </div>

        {/* WEEKDAYS */}
        <div className="grid grid-cols-7 text-center text-[#f3d8b6]/80 py-3 px-6 text-xs font-extrabold tracking-wider">
          <div>LUN</div>
          <div>MAR</div>
          <div>MER</div>
          <div>GIO</div>
          <div>VEN</div>
          <div>SAB</div>
          <div>DOM</div>
        </div>

        {/* GRID */}
        <div className="px-6 pb-6">
          <div className="grid grid-cols-7 gap-2">
            {days.map((date, idx) => {
              if (!date) return <div key={`empty-${idx}`} className="h-[76px]" />;

              const count = appointmentsByDay[date] || 0;
              const hasAppointments = count > 0;
              const dayNum = Number(date.split("-")[2]);

              const isToday = date === today;
              const isSelected = !!selectedDate && date === selectedDate;

              return (
                <button
                  key={date}
                  onClick={() => {
                    onSelectDate(date);
                    close();
                  }}
                  className={[
                    "h-[76px] rounded-2xl border text-left p-3 transition relative overflow-hidden",
                    "shadow-[0_10px_30px_rgba(0,0,0,0.18)]",
                    isSelected
                      ? "bg-[#f3d8b6]/15 border-[#f3d8b6]/35"
                      : "bg-black/20 border-[#5c3a21]/55 hover:bg-black/25",
                    isToday && !isSelected ? "ring-1 ring-[#0FA958]/40" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={[
                        "text-lg font-extrabold leading-none",
                        isSelected ? "text-[#f3d8b6]" : "text-white/90",
                      ].join(" ")}
                    >
                      {dayNum}
                    </div>

                    {isToday && (
                      <span className="text-[10px] font-extrabold tracking-wider px-2 py-1 rounded-xl bg-[#0FA958] text-white">
                        OGGI
                      </span>
                    )}
                  </div>

                  <div className="mt-2">
                    {hasAppointments ? (
                      <span className="inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 bg-white/10 border border-white/10 text-xs text-white/85">
                        <span className="h-2 w-2 rounded-full bg-[#f3d8b6]" />
                        {count} app
                      </span>
                    ) : (
                      <span className="text-xs text-white/35">—</span>
                    )}
                  </div>

                  {hasAppointments && (
                    <div className="absolute left-0 bottom-0 right-0 h-[3px] bg-[#f3d8b6]/35" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-5 text-center text-xs text-white/45">
            Mostra conteggi solo per il{" "}
            <span className="text-[#f3d8b6] font-extrabold">salone attivo</span>.
          </div>
        </div>
      </motion.div>
    </div>
  );
}
