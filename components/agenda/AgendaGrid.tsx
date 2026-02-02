"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import AgendaModal from "./AgendaModal";
import EditAppointmentModal from "./EditAppointmentModal";
import AppointmentBox from "./AppointmentBox";
import { generateHours, generateWeekDaysFromDate } from "./utils";

export default function AgendaGrid({ currentDate }: { currentDate: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId, isReady, role } = useActiveSalon();

  const [view, setView] = useState<"day" | "week">("day");

  const [staff, setStaff] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSlot, setSelectedSlot] = useState<{
    time: string;
    staffId: number | null;
  } | null>(null);

  const [editingAppointment, setEditingAppointment] = useState<any>(null);

  const hours = generateHours("08:00", "20:00", 30);

  // ✅ staff: ricarica quando cambia salone
  useEffect(() => {
    if (!isReady) return;
    if (role === "magazzino") return; // magazzino non usa agenda
    if (activeSalonId == null) return;

    void loadStaff(activeSalonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, role, activeSalonId]);

  // ✅ appointments: ricarica quando cambia data/view/salone
  useEffect(() => {
    if (!isReady) return;
    if (role === "magazzino") return;
    if (activeSalonId == null) return;

    void loadAppointments(activeSalonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, view, isReady, role, activeSalonId]);

  async function loadStaff(salonId: number) {
    const { data } = await supabase
      .from("staff")
      .select("*")
      .eq("active", true)
      .eq("salon_id", salonId)
      .order("name");

    const available = [{ id: null, name: "Disponibile", color: "#a8754f" }];
    setStaff(available.concat(data || []));
  }

  function getRangeForView(dateString: string) {
    if (view === "day") {
      return {
        start: `${dateString}T00:00:00`,
        end: `${dateString}T23:59:59`,
      };
    }

    // week: lun -> dom
    const base = new Date(dateString);
    const day = base.getDay() || 7;

    const weekStart = new Date(base);
    weekStart.setDate(base.getDate() - (day - 1));
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(base);
    weekEnd.setDate(base.getDate() + (7 - day));
    weekEnd.setHours(23, 59, 59, 999);

    const toNoZ = (d: Date) => d.toISOString().replace("Z", "");
    return { start: toNoZ(weekStart), end: toNoZ(weekEnd) };
  }

  async function loadAppointments(salonId: number) {
    if (!currentDate) return;
    setLoading(true);

    const range = getRangeForView(currentDate);

    const { data } = await supabase
      .from("appointments")
      .select(
        `
        *,
        customers:customer_id ( id, first_name, last_name, phone ),
        staff:staff_id ( id, name ),
        appointment_services (
          id,
          duration_minutes,
          service:service_id ( id, name, color_code )
        )
      `
      )
      .eq("salon_id", salonId) // ✅ SEMPRE
      .gte("start_time", range.start)
      .lte("start_time", range.end)
      .order("start_time", { ascending: true });

    setAppointments(data || []);
    setLoading(false);
  }

  function handleSlotClick(time: string, staffId: number | null) {
    setSelectedSlot({ time, staffId });
  }

  function handleAppointmentClick(a: any) {
    setEditingAppointment(a);
  }

  if (!isReady) {
    return <div className="px-4 text-white/70">Caricamento...</div>;
  }

  if (role === "magazzino") {
    return <div className="px-4 text-white/70">Agenda non disponibile per Magazzino.</div>;
  }

  if (activeSalonId == null) {
    return <div className="px-4 text-white/70">Nessun salone selezionato.</div>;
  }

  return (
    <div className="w-full">
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

      {loading ? (
        <div className="px-4 text-white/70">Caricamento...</div>
      ) : view === "day" ? (
        <DayView
          staff={staff}
          hours={hours}
          appointments={appointments}
          onSlotClick={handleSlotClick}
          onAppointmentClick={handleAppointmentClick}
          onAppointmentsChanged={() => void loadAppointments(activeSalonId)}
        />
      ) : (
        <WeekView
          hours={hours}
          appointments={appointments}
          onSlotClick={handleSlotClick}
          onAppointmentClick={handleAppointmentClick}
          currentDate={currentDate}
          onAppointmentsChanged={() => void loadAppointments(activeSalonId)}
        />
      )}

      {selectedSlot && (
        <AgendaModal
          isOpen={true}
          selectedSlot={selectedSlot}
          currentDate={currentDate}
          close={() => setSelectedSlot(null)}
          onCreated={() => void loadAppointments(activeSalonId)}
        />
      )}

      {editingAppointment && (
        <EditAppointmentModal
          isOpen={true}
          appointment={editingAppointment}
          selectedDay={currentDate}
          close={() => setEditingAppointment(null)}
          onUpdated={() => void loadAppointments(activeSalonId)}
        />
      )}
    </div>
  );
}


function DayView({
  staff,
  hours,
  appointments,
  onSlotClick,
  onAppointmentClick,
  onAppointmentsChanged,
}: any) {
  return (
    <div className="overflow-x-auto">
      <div
        className="grid"
        style={{ gridTemplateColumns: `120px repeat(${staff.length}, 1fr)` }}
      >
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

        {staff.map((s: any) => (
          <div
            key={String(s.id)}
            className="relative border-l border-[#442f25] bg-[#1c0f0a]"
          >
            <div className="sticky top-0 bg-[#1c0f0a] text-center py-3 border-b border-[#3a251a] text-[#d8a471] font-medium">
              {s.name}
            </div>

            {hours.map((h: string) => (
              <div
                key={h}
                className="h-10 border-b border-[#3a251a] cursor-pointer hover:bg-[#3a251a]/40"
                onClick={() => onSlotClick(h, s.id ?? null)}
              />
            ))}

            {appointments
              .filter((a: any) =>
                s.id == null ? a.staff_id == null : a.staff_id === s.id
              )
              .map((a: any) => (
                <AppointmentBox
                  key={a.id}
                  appointment={a}
                  hours={hours}
                  onClick={() => onAppointmentClick(a)}
                  onUpdated={onAppointmentsChanged}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekView({
  hours,
  appointments,
  onSlotClick,
  onAppointmentClick,
  currentDate,
  onAppointmentsChanged,
}: any) {
  const days = generateWeekDaysFromDate(currentDate);

  return (
    <div className="overflow-x-auto">
      <div
        className="grid"
        style={{ gridTemplateColumns: `120px repeat(7, 1fr)` }}
      >
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

        {days.map((d: any) => (
          <div
            key={d.date}
            className="relative border-l border-[#442f25] bg-[#1c0f0a]"
          >
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
              .filter((a: any) => String(a.start_time).startsWith(d.date))
              .map((a: any) => (
                <AppointmentBox
                  key={a.id}
                  appointment={a}
                  hours={hours}
                  onClick={() => onAppointmentClick(a)}
                  onUpdated={onAppointmentsChanged}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
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
