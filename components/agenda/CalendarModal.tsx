"use client";

import { useEffect, useMemo, useState } from "react";
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

/** ✅ parse robusto anche se arriva con Z o senza */
function parseTsSafe(ts: string) {
  const s = String(ts || "");
  // Se è ISO con Z, Date() lo capisce; se è naive "YYYY-MM-DDTHH:mm:ss" spesso lo tratta come locale
  // Noi vogliamo comunque estrarre la data "YYYY-MM-DD" in modo stabile.
  const head = s.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return toYmd(d);
  return head || "";
}

export default function CalendarModal({
  isOpen,
  close,
  onSelectDate,
  selectedDate,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId } = useActiveSalon();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [appointmentsByDay, setAppointmentsByDay] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) return;
    void loadAppointmentsForMonth(currentMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentMonth, activeSalonId]);

  async function loadAppointmentsForMonth(date: Date) {
    if (activeSalonId == null) {
      setAppointmentsByDay({});
      return;
    }

    const y = date.getFullYear();
    const m1 = date.getMonth() + 1; // 1..12

    const start = `${y}-${String(m1).padStart(2, "0")}-01T00:00:00`;
    const lastDay = new Date(y, m1, 0).getDate();
    const end = `${y}-${String(m1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59`;

    const { data, error } = await supabase
      .from("appointments")
      .select("start_time")
      .eq("salon_id", Number(activeSalonId))
      .gte("start_time", start)
      .lte("start_time", end);

    if (error) {
      console.error(error);
      setAppointmentsByDay({});
      return;
    }

    const grouped: Record<string, number> = {};
    (data || []).forEach((a: any) => {
      if (!a?.start_time) return;
      const key = parseTsSafe(a.start_time);
      if (!key) return;
      grouped[key] = (grouped[key] || 0) + 1;
    });

    setAppointmentsByDay(grouped);
  }

  function changeMonth(offset: number) {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + offset);
    setCurrentMonth(newMonth);
  }

  function generateCalendarDays() {
    const y = currentMonth.getFullYear();
    const m0 = currentMonth.getMonth(); // 0..11

    // JS: getDay() dom=0..sab=6. Noi vogliamo lun=1..dom=7
    const jsFirst = new Date(y, m0, 1).getDay();
    const firstDay = jsFirst === 0 ? 7 : jsFirst; // lun=1..dom=7

    const daysInMonth = new Date(y, m0 + 1, 0).getDate();

    const days: Array<string | null> = [];
    for (let i = 1; i < firstDay; i++) days.push(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push(dateStr);
    }
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
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] bg-black/65 backdrop-blur-sm p-4">
      <motion.div
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
            className="rounded-2xl p-2 bg-black/25 border border-white/10 text-white/70
                       hover:bg-black/35 transition"
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
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2
                       bg-black/20 border border-[#5c3a21]/60 text-[#f3d8b6]
                       hover:bg-black/30 transition"
          >
            <ChevronLeft size={18} />
            Mese prec.
          </button>

          <button
            onClick={() => setCurrentMonth(new Date())}
            className="rounded-2xl px-4 py-2 bg-[#f3d8b6] text-[#1A0F0A] font-extrabold
                       hover:opacity-90 transition"
          >
            Oggi
          </button>

          <button
            onClick={() => changeMonth(1)}
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2
                       bg-black/20 border border-[#5c3a21]/60 text-[#f3d8b6]
                       hover:bg-black/30 transition"
          >
            Mese succ.
            <ChevronRight size={18} />
          </button>
        </div>

        {/* WEEKDAYS */}
        <div className="grid grid-cols-7 text-center text-[#f3d8b6]/80 py-3 px-6 text-xs font-extrabold tracking-wider">
          <div>LUN</div><div>MAR</div><div>MER</div><div>GIO</div><div>VEN</div><div>SAB</div><div>DOM</div>
        </div>

        {/* GRID */}
        <div className="px-6 pb-6">
          <div className="grid grid-cols-7 gap-2">
            {days.map((date, idx) => {
              if (!date) return <div key={idx} className="h-[76px]" />;

              const count = appointmentsByDay[date] || 0;
              const hasAppointments = count > 0;
              const dayNum = Number(date.split("-")[2]);

              const isToday = date === today;
              const isSelected = selectedDate ? date === selectedDate : false;

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
                      ? "bg-[#f3d8b6]/15 border-[#f3d8b6]/30"
                      : "bg-black/20 border-[#5c3a21]/55 hover:bg-black/25",
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
                      <span className="text-[10px] font-extrabold tracking-wider px-2 py-1 rounded-xl
                                       bg-[#0FA958] text-white shadow-[0_10px_30px_rgba(15,169,88,0.18)]">
                        OGGI
                      </span>
                    )}
                  </div>

                  <div className="mt-2">
                    {hasAppointments ? (
                      <span className="inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5
                                       bg-white/10 border border-white/10 text-xs text-white/85">
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
