"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabaseClient"; // ✅ IMPORT GIUSTO

interface Props {
  isOpen: boolean;
  close: () => void;
  onSelectDate: (date: string) => void;
}

export default function CalendarModal({ isOpen, close, onSelectDate }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [appointmentsByDay, setAppointmentsByDay] = useState<Record<string, number>>({});
    const supabase = createClient(); // ✅ ORA FUNZIONA
  useEffect(() => {
    if (isOpen) loadAppointmentsForMonth(currentMonth);
  }, [isOpen, currentMonth]);

  async function loadAppointmentsForMonth(date: Date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;

    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = `${y}-${String(m).padStart(2, "0")}-31`;

    const { data } = await supabase
      .from("appointments")
      .select("date");

    const grouped: Record<string, number> = {};

    (data || []).forEach((a: any) => {
      const d = a.date;
      grouped[d] = (grouped[d] || 0) + 1;
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

    const days = [];

    // Spazi vuoti prima del primo giorno
    for (let i = 1; i < firstDay; i++) days.push(null);

    // Giorni reali
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d).toISOString().split("T")[0];
      days.push(date);
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
        className="w-full max-w-xl bg-[#1c0f0a] 
        border border-[#9b6b43]/40 rounded-2xl shadow-xl overflow-hidden text-white"
      >

        {/* HEADER */}
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

        {/* GRID GIORNI SETTIMANA */}
        <div className="grid grid-cols-7 text-center text-[#d8a471] py-3 font-medium">
          <div>Lun</div>
          <div>Mar</div>
          <div>Mer</div>
          <div>Gio</div>
          <div>Ven</div>
          <div>Sab</div>
          <div>Dom</div>
        </div>

        {/* CALENDARIO */}
        <div className="grid grid-cols-7 gap-1 p-4 pt-0">
          {days.map((date, idx) => {
            if (!date) {
              return <div key={idx} className="h-16"></div>;
            }

            const hasAppointments = appointmentsByDay[date] > 0;
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
                  <div className="text-xs opacity-80">
                    {appointmentsByDay[date]} app
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* CHIUDI */}
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
