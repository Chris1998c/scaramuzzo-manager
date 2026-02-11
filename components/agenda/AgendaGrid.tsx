"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import AgendaModal from "./AgendaModal";
import EditAppointmentModal from "./EditAppointmentModal";
import AppointmentBox from "./AppointmentBox";
import {
  generateHours,
  generateWeekDaysFromDate,
  SLOT_MINUTES,
  SLOT_PX,
} from "./utils";
import { CalendarDays, Users, Loader2 } from "lucide-react";

type ViewMode = "day" | "week";
type OnCashIn = (appointmentId: number) => void;

export default function AgendaGrid({ currentDate }: { currentDate: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { activeSalonId, isReady, role } = useActiveSalon();

  const [view, setView] = useState<ViewMode>("day");
  const [staff, setStaff] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSlot, setSelectedSlot] = useState<{
    time: string;
    staffId: string | null;
  } | null>(null);

  const [editingAppointment, setEditingAppointment] = useState<any>(null);

  const hours = useMemo(() => generateHours("08:00", "20:00", SLOT_MINUTES), []);

  // 1. Caricamento Staff
  useEffect(() => {
    if (!isReady || role === "magazzino" || activeSalonId == null) return;
    loadStaff(activeSalonId);
  }, [isReady, role, activeSalonId]);

  // 2. Caricamento Appuntamenti
  useEffect(() => {
    if (!isReady || role === "magazzino" || activeSalonId == null) return;
    loadAppointments(activeSalonId);
  }, [currentDate, view, isReady, role, activeSalonId]);

  async function loadStaff(salonId: number) {
    const { data, error } = await supabase
      .from("staff")
      .select("*")
      .eq("active", true)
      .eq("salon_id", salonId)
      .order("name");

    if (error) {
      setStaff([{ id: null, name: "Disponibile" }]);
      return;
    }
    const available = [{ id: null, name: "Disponibile" }];
    setStaff(available.concat(data || []));
  }

  async function loadAppointments(salonId: number) {
    if (!currentDate) return;
    setLoading(true);
    const range = getRangeForView(currentDate);

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id,
        salon_id,
        staff_id,
        customer_id,
        start_time,
        end_time,
        status,
        notes,
        customers:customer_id ( id, first_name, last_name, phone ),
        staff:staff_id ( id, name ),
        appointment_services (
          id,
          duration_minutes,
          service:service_id ( id, name, color_code )
        )
      `)
      .eq("salon_id", salonId)
      .gte("start_time", range.start)
      .lte("start_time", range.end);

    if (error) {
      console.error(error);
      setAppointments([]);
    } else {
      setAppointments(data || []);
    }
    setLoading(false);
  }

  function getRangeForView(dateString: string) {
    if (view === "day") {
      return { start: `${dateString}T00:00:00`, end: `${dateString}T23:59:59` };
    }
    const days = generateWeekDaysFromDate(dateString);
    return { 
      start: `${days[0].date}T00:00:00`, 
      end: `${days[6].date}T23:59:59` 
    };
  }

  function handleCashIn(appointmentId: number) {
    router.push(`/dashboard/cassa/${appointmentId}`);
  }

  if (!isReady) return <div className="p-8 text-[#f3d8b6]/50 italic">Caricamento sistema...</div>;
  if (role === "magazzino") return <div className="p-8 text-[#f3d8b6]/50">Accesso negato all'agenda.</div>;
  if (activeSalonId == null) return <div className="p-8 text-[#f3d8b6]/50">Seleziona un salone per visualizzare l'agenda.</div>;

  return (
    <div className="w-full space-y-4">
      {/* HEADER CONTROLS */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-[#f3d8b6]">
          <span className="rounded-2xl p-2 bg-black/20 border border-[#5c3a21]/60">
            <CalendarDays size={18} />
          </span>
          <div className="text-sm">
            <span className="text-white/60">Vista: </span>
            <span className="font-bold uppercase tracking-wider">{view === "day" ? "Giorno" : "Settimana"}</span>
          </div>
        </div>

        <div className="inline-flex rounded-2xl bg-black/20 border border-[#5c3a21]/60 p-1">
          <button
            onClick={() => setView("day")}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
              view === "day" ? "bg-[#f3d8b6] text-black shadow-lg" : "text-[#f3d8b6] hover:bg-white/5"
            }`}
          >
            GIORNO
          </button>
          <button
            onClick={() => setView("week")}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
              view === "week" ? "bg-[#f3d8b6] text-black shadow-lg" : "text-[#f3d8b6] hover:bg-white/5"
            }`}
          >
            SETTIMANA
          </button>
        </div>
      </div>

      {/* LOADING STATE */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-96 bg-black/10 rounded-3xl border border-dashed border-[#5c3a21]/40">
          <Loader2 className="animate-spin text-[#f3d8b6] mb-2" size={32} />
          <p className="text-[#f3d8b6]/60 text-sm">Sincronizzazione appuntamenti...</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-[#5c3a21]/45 bg-[#140b07]/40 backdrop-blur-md overflow-hidden shadow-2xl">
          <div className="overflow-auto max-h-[calc(100vh-280px)] custom-scrollbar">
            {view === "day" ? (
              <DayLayout
                staff={staff}
                hours={hours}
                appointments={appointments}
                onSlotClick={(h: string, sid: string | null) => setSelectedSlot({ time: h, staffId: sid })}
                onEdit={setEditingAppointment}
                onCashIn={handleCashIn}
                onRefresh={() => loadAppointments(activeSalonId)}
              />
            ) : (
              <WeekLayout
                currentDate={currentDate}
                hours={hours}
                appointments={appointments}
                onSlotClick={(h: string) => setSelectedSlot({ time: h, staffId: null })}
                onEdit={setEditingAppointment}
                onCashIn={handleCashIn}
                onRefresh={() => loadAppointments(activeSalonId)}
              />
            )}
          </div>
        </div>
      )}

      {/* MODALS */}
      {selectedSlot && (
        <AgendaModal
          isOpen={true}
          selectedSlot={selectedSlot}
          currentDate={currentDate}
          close={() => setSelectedSlot(null)}
          onCreated={() => loadAppointments(activeSalonId)}
        />
      )}

      {editingAppointment && (
        <EditAppointmentModal
          isOpen={true}
          appointment={editingAppointment}
          selectedDay={currentDate}
          close={() => setEditingAppointment(null)}
          onUpdated={() => loadAppointments(activeSalonId)}
        />
      )}
    </div>
  );
}

/* ========================== DAY LAYOUT ========================== */

function DayLayout({ staff, hours, appointments, onSlotClick, onEdit, onCashIn, onRefresh }: any) {
  const colTemplate = `80px repeat(${staff.length}, minmax(240px, 1fr))`;

  return (
    <div className="grid" style={{ gridTemplateColumns: colTemplate }}>
      {/* TIME COLUMN */}
      <div className="sticky left-0 z-30 bg-[#140b07] border-r border-[#5c3a21]/45 shadow-xl">
        <div className="h-[52px] border-b border-[#5c3a21]/45 flex items-center justify-center">
          <span className="text-[10px] font-bold text-[#f3d8b6]/40 uppercase">Ora</span>
        </div>
        {hours.map((h: string) => (
          <div
            key={h}
            style={{ height: SLOT_PX }}
            className="flex items-start justify-center pt-1 text-[#f3d8b6]/60 text-[11px] font-mono border-b border-white/5"
          >
            {h.endsWith(":00") || h.endsWith(":30") ? h : ""}
          </div>
        ))}
      </div>

      {/* STAFF COLUMNS */}
      {staff.map((s: any) => {
        const sid = s.id ? String(s.id) : null;
        const colApps = appointments.filter((a: any) => 
          sid === null ? a.staff_id === null : String(a.staff_id) === sid
        );

        return (
          <div key={sid || 'unassigned'} className="relative border-r border-white/5 min-h-full">
            {/* Header Staff */}
            <div className="sticky top-0 z-20 h-[52px] bg-[#1c110d] border-b border-[#5c3a21]/45 flex items-center justify-center gap-2">
              <Users size={12} className="text-[#f3d8b6]/40" />
              <span className="text-xs font-black text-[#f3d8b6] uppercase tracking-tighter truncate px-2">
                {s.name}
              </span>
            </div>

            {/* Clickable Grid */}
            <div className="relative">
              {hours.map((h: string) => (
                <div
                  key={h}
                  style={{ height: SLOT_PX }}
                  className="border-b border-white/5 cursor-crosshair hover:bg-[#f3d8b6]/5 transition-colors"
                  onClick={() => onSlotClick(h, sid)}
                />
              ))}

              {/* Appointment Overlay */}
              <div className="absolute inset-0 pointer-events-none z-10">
                {colApps.map((a: any) => (
                  <div key={a.id} className="pointer-events-auto">
                    <AppointmentBox
                      appointment={a}
                      hours={hours}
                      onClick={() => onEdit(a)}
                      onUpdated={onRefresh}
                      onCashIn={() => onCashIn(a.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ========================== WEEK LAYOUT ========================== */

function WeekLayout({ currentDate, hours, appointments, onSlotClick, onEdit, onCashIn, onRefresh }: any) {
  const days = generateWeekDaysFromDate(currentDate);
  const colTemplate = `80px repeat(7, minmax(200px, 1fr))`;

  return (
    <div className="grid" style={{ gridTemplateColumns: colTemplate }}>
      {/* TIME COLUMN */}
      <div className="sticky left-0 z-30 bg-[#140b07] border-r border-[#5c3a21]/45 shadow-xl">
        <div className="h-[52px] border-b border-[#5c3a21]/45 flex items-center justify-center">
           <span className="text-[10px] font-bold text-[#f3d8b6]/40 uppercase">Ora</span>
        </div>
        {hours.map((h: string) => (
          <div
            key={h}
            style={{ height: SLOT_PX }}
            className="flex items-start justify-center pt-1 text-[#f3d8b6]/60 text-[11px] font-mono border-b border-white/5"
          >
            {h.endsWith(":00") || h.endsWith(":30") ? h : ""}
          </div>
        ))}
      </div>

      {/* DAY COLUMNS */}
      {days.map((d: any) => {
        const dayApps = appointments.filter((a: any) => a.start_time.startsWith(d.date));

        return (
          <div key={d.date} className="relative border-r border-white/5 min-h-full">
            {/* Header Day */}
            <div className="sticky top-0 z-20 h-[52px] bg-[#1c110d] border-b border-[#5c3a21]/45 flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-[#f3d8b6]/40 uppercase tracking-widest">{d.label.split(' ')[0]}</span>
              <span className="text-xs font-black text-[#f3d8b6]">{d.label.split(' ')[1]}</span>
            </div>

            {/* Clickable Grid */}
            <div className="relative">
              {hours.map((h: string) => (
                <div
                  key={h}
                  style={{ height: SLOT_PX }}
                  className="border-b border-white/5 cursor-crosshair hover:bg-[#f3d8b6]/5 transition-colors"
                  onClick={() => onSlotClick(h, null)}
                />
              ))}

              {/* Appointment Overlay */}
              <div className="absolute inset-0 pointer-events-none z-10">
                {dayApps.map((a: any) => (
                  <div key={a.id} className="pointer-events-auto">
                    <AppointmentBox
                      appointment={a}
                      hours={hours}
                      onClick={() => onEdit(a)}
                      onUpdated={onRefresh}
                      onCashIn={() => onCashIn(a.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}