"use client";
export const dynamic = "force-dynamic";


import { useState, useEffect } from "react";
import AgendaGrid from "@/components/agenda/AgendaGrid";
import SearchPalette from "@/components/SearchPalette";
import CalendarModal from "@/components/agenda/CalendarModal";
import { supabase } from "@/lib/supabaseClient";

export default function AgendaPage() {
  const [currentDate, setCurrentDate] = useState<string>("");
  const [calendarOpen, setCalendarOpen] = useState(false);

  async function loadToday() {
    const { data } = await supabase.rpc("get_server_date");
    setCurrentDate(data);
  }

  useEffect(() => {
    loadToday();
  }, []);

  if (!currentDate) {
    return (
      <div className="text-white p-6">
        Caricamento data…
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#110904] text-white p-4">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-semibold text-[#d8a471]">
          Agenda 
        </h1>

        <button
          onClick={() => setCalendarOpen(true)}
          className="px-4 py-3 bg-[#3a251a] text-[#d8a471] 
          rounded-xl border border-[#9b6b43]/40 hover:bg-[#4a2f22]"
        >
          📅 Vai alla data
        </button>
      </div>

      {/* AGENDA GRID PER DATA */}
      <AgendaGrid currentDate={currentDate} />

      {/* SEARCH */}
      <SearchPalette />

      {/* CALENDARIO */}
      <CalendarModal
        isOpen={calendarOpen}
        close={() => setCalendarOpen(false)}
        onSelectDate={(d) => {
          setCurrentDate(d);
        }}
      />
    </div>
  );
}
