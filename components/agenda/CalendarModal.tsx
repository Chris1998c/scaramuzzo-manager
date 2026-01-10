"use client";

import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabaseClient";
import { dayFromTs } from "@/lib/appointmentTime";

interface Props {
  isOpen: boolean;
  close: () => void;
  onSelectDate: (date: string) => void;
}

export default function CalendarModal({ isOpen, close, onSelectDate }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [appointmentsByDay, setAppointmentsByDay] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    if (!isOpen) return;
    void loadAppointmentsForMonth(currentMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentMonth]);

  async function loadAppointmentsForMonth(date: Date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;

    const start = `${y}-${String(m).padStart(2, "0")}-01T00:00:00`;
    const lastDay = new Date(y, m, 0).getDate(); // m è 1..12
    const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(
      2,
      "0"
    )}T23:59:59`;

    const { data } = await supabase
      .from("appointments")
      .select("start_time")
      .gte("start_time", start)
      .lte("start_time", end);

    const grouped: Record<string, number> = {};

    (data || []).forEach((a: any) => {
      if (!a.start_time) return;
      const day = dayFromTs(a.start_time);
      grouped[day] = (grouped[day] || 0) + 1;
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
    const m = currentMonth.getMonth();

    const firstDay = new Date(y, m, 1).getDay() || 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const days: Array<string | null> = [];

    for (let i = 1; i < firstDay; i++) days.push(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(
        d
      ).padStart(2, "0")}`;
      days.push(dateStr);
    }

    return days;
  }

  if (!isOpen) return null;

  const monthName = currentMonth.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  const days = generateCalendarDays();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-start justify-center pt-[10vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl bg-[#1c0f0a] border border-[#9b6b43]/40 rounded-2xl shadow-xl overflow-hidden text-white"
      >
        <div className="flex items-center justify-between p-5 border-b border-[#3a251a]">
          <button
            onClick={() => changeMonth(-1)}
            className="text-[#d8a471] text-2xl px-3"
          >
            ←
          </button>

          <h2 className="text-xl font-semibold text-[#d8a471] capitalize">
            {monthName}
          </h2>

          <button
            onClick={() => changeMonth(1)}
            className="text-[#d8a471] text-2xl px-3"
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-[#d8a471] py-3 font-medium">
          <div>Lun</div>
          <div>Mar</div>
          <div>Mer</div>
          <div>Gio</div>
          <div>Ven</div>
          <div>Sab</div>
          <div>Dom</div>
        </div>

        <div className="grid grid-cols-7 gap-1 p-4 pt-0">
          {days.map((date, idx) => {
            if (!date) return <div key={idx} className="h-16" />;

            const count = appointmentsByDay[date] || 0;
            const hasAppointments = count > 0;
            const dayNum = Number(date.split("-")[2]);

            return (
              <button
                key={date}
                onClick={() => {
                  onSelectDate(date);
                  close();
                }}
                className={`h-16 rounded-xl flex flex-col items-center justify-center border 
                  ${
                    hasAppointments
                      ? "bg-[#d8a471] text-black border-[#c39263]"
                      : "bg-[#3a251a] text-white border-[#5c3c2a]"
                  }
                  hover:bg-[#d8a471] hover:text-black transition`}
              >
                <div className="text-lg font-bold">{dayNum}</div>
                {hasAppointments && (
                  <div className="text-xs opacity-80">{count} app</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 text-center border-t border-[#3a251a]">
          <button
            onClick={close}
            className="text-white/70 hover:text-white transition"
          >
            Chiudi
          </button>
        </div>
      </motion.div>
    </div>
  );
}
