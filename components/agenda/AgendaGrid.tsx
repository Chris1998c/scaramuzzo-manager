"use client";
export const dynamic = "force-dynamic";


import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient"; // ✅ IMPORT GIUSTO
import AgendaModal from "./AgendaModal";
import EditAppointmentModal from "./EditAppointmentModal";
import AppointmentBox from "./AppointmentBox";

/* ============================================================
   AGENDA GRID — VERSIONE CORRETTA E AGGIORNATA
   ============================================================ */

export default function AgendaGrid({ currentDate }: { currentDate: string }) {
  const [view, setView] = useState<"day" | "week">("day");
    const supabase = createClient(); // ✅ ORA FUNZIONA
  const [staff, setStaff] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);

  const hours = generateHours("08:00", "20:00", 30);

  /* ============================================================
     LOAD STATIC DATA (STAFF + SERVICES)
     ============================================================ */
  useEffect(() => {
    loadStaff();
    loadServices();
  }, []);

  async function loadStaff() {
    const { data } = await supabase
      .from("staff")
      .select("*")
      .eq("active", true)
      .order("name");

    // Disponibile come primo collaboratore
    const available = [{ id: null, name: "Disponibile", color: "#a8754f" }];
    setStaff(available.concat(data || []));
  }

  async function loadServices() {
    const { data } = await supabase.from("services").select("*");
    setServices(data || []);
  }

  /* ============================================================
     LOAD APPOINTMENTS PER DATA SELEZIONATA
     ============================================================ */
  useEffect(() => {
    loadAppointments();
  }, [currentDate]);

  async function loadAppointments() {
    if (!currentDate) return;

    const { data } = await supabase
      .from("appointments")
      .select("*, customers(*), services(*)")
      .eq("date", currentDate); // ← FILTRO PER DATA

    const mapped = (data || []).map((a: any) => ({
      ...a,
      service_color: a.services?.color || "#8c6239",
      duration: a.duration || a.services?.duration || 30,
    }));

    setAppointments(mapped);
    setLoading(false);
  }

  /* ============================================================
     CLICK SLOT
     ============================================================ */
  function handleSlotClick(time: string, collaborator: string | null) {
    setSelectedSlot({ time, collaborator });
  }

  /* ============================================================
     CLICK SU APPUNTAMENTO
     ============================================================ */
  function handleAppointmentClick(a: any) {
    setEditingAppointment(a);
  }

  return (
    <div className="w-full">

      {/* NAV VIEW */}
      <div className="flex justify-between mb-6 px-4">
        <h1 className="text-3xl font-semibold text-[#d8a471]">
          {formatDateItalian(currentDate)}
        </h1>

        <div className="flex gap-3">
          <button
            onClick={() => setView("day")}
            className={`px-4 py-2 rounded-xl ${
              view === "day"
                ? "bg-[#d8a471] text-black"
                : "bg-[#3a251a] text-white"
            }`}
          >
            Giorno
          </button>

          <button
            onClick={() => setView("week")}
            className={`px-4 py-2 rounded-xl ${
              view === "week"
                ? "bg-[#d8a471] text-black"
                : "bg-[#3a251a] text-white"
            }`}
          >
            Settimana
          </button>
        </div>
      </div>

      {/* GRID */}
      {view === "day" ? (
        <DayView
          staff={staff}
          hours={hours}
          appointments={appointments}
          onSlotClick={handleSlotClick}
          onAppointmentClick={handleAppointmentClick}
        />
      ) : (
        <WeekView
          staff={staff}
          hours={hours}
          appointments={appointments}
          onSlotClick={handleSlotClick}
          onAppointmentClick={handleAppointmentClick}
          currentDate={currentDate}
        />
      )}

      {/* MODALI */}
      {selectedSlot && (
        <AgendaModal
          isOpen={true}
          selectedSlot={selectedSlot}
          close={() => setSelectedSlot(null)}
        />
      )}

      {editingAppointment && (
        <EditAppointmentModal
          isOpen={true}
          appointment={editingAppointment}
          close={() => setEditingAppointment(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   DAY VIEW
   ============================================================ */

function DayView({ staff, hours, appointments, onSlotClick, onAppointmentClick }: any) {
  return (
    <div className="overflow-x-auto">
      <div
        className="grid"
        style={{ gridTemplateColumns: `120px repeat(${staff.length}, 1fr)` }}
      >
        {/* ORARI */}
        <div className="flex flex-col">
          {hours.map((h: string) => (
            <div
              key={h}
              className="h-10 flex items-center justify-end pr-3 text-[#d8a471]"
            >
              {h}
            </div>
          ))}
        </div>

        {/* COLLABORATORI */}
        {staff.map((s: any) => (
          <div key={s.id} className="relative border-l border-[#442f25] bg-[#1c0f0a]">
            {/* Sticky header */}
            <div className="sticky top-0 bg-[#1c0f0a] text-center py-3 border-b border-[#3a251a] text-[#d8a471] font-medium">
              {s.name}
            </div>

            {/* Slot orari */}
            {hours.map((h: string) => (
              <div
                key={h}
                className="h-10 border-b border-[#3a251a] cursor-pointer hover:bg-[#3a251a]/40"
                onClick={() => onSlotClick(h, s.id)}
              />
            ))}

            {/* Appuntamenti */}
            {appointments
              .filter((a: any) => a.collaborator_id === s.id)
              .map((a: any) => (
                <AppointmentBox
                  key={a.id}
                  appointment={a}
                  hours={hours}
                  onClick={() => onAppointmentClick(a)}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   WEEK VIEW
   ============================================================ */

function WeekView({ staff, hours, appointments, onSlotClick, onAppointmentClick, currentDate }: any) {
  const days = generateWeekDaysFromDate(currentDate);

  return (
    <div className="overflow-x-auto">
      <div className="grid" style={{ gridTemplateColumns: `120px repeat(7, 1fr)` }}>
        
        {/* ORARI */}
        <div className="flex flex-col">
          {hours.map((h: string) => (
            <div key={h} className="h-10 flex items-center justify-end pr-3 text-[#d8a471]">
              {h}
            </div>
          ))}
        </div>

        {days.map((d: any) => (
          <div key={d.date} className="relative border-l border-[#442f25] bg-[#1c0f0a]">
            <div className="sticky top-0 bg-[#1c0f0a] text-center py-3 border-b border-[#3a251a] text-[#d8a471] font-medium">
              {d.label}
            </div>

            {hours.map((h: string) => (
              <div
                key={h}
                className="h-10 border-b border-[#3a251a] cursor-pointer hover:bg-[#3a251a]/40"
                onClick={() => onSlotClick(h, null)}
              />
            ))}

            {appointments
              .filter((a: any) => a.date === d.date)
              .map((a: any) => (
                <AppointmentBox
                  key={a.id}
                  appointment={a}
                  hours={hours}
                  onClick={() => onAppointmentClick(a)}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   UTILITY FUNZIONI
   ============================================================ */

function generateHours(start: string, end: string, step: number) {
  const res = [];
  let [h, m] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  while (h < endH || (h === endH && m <= endM)) {
    res.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += step;
    if (m >= 60) {
      m -= 60;
      h++;
    }
  }
  return res;
}

function generateWeekDaysFromDate(dateString: string) {
  const base = new Date(dateString);
  const day = base.getDay() || 7; // Lunedì = 1, Domenica = 7

  const days = [];

  for (let i = 1; i <= 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - (day - i));

    days.push({
      date: d.toISOString().split("T")[0],
      label: d.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
      }),
    });
  }

  return days;
}

function formatDateItalian(stringDate: string) {
  const date = new Date(stringDate);
  return date.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
