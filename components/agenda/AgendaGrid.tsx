// C:\dev\scaramuzzo-manager\components\agenda\AgendaGrid.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
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
import { CalendarDays, Users } from "lucide-react";

type ViewMode = "day" | "week";

export default function AgendaGrid({ currentDate }: { currentDate: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId, isReady, role } = useActiveSalon();

  const [view, setView] = useState<ViewMode>("day");
  const [staff, setStaff] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSlot, setSelectedSlot] = useState<{
    time: string;
    staffId: string | null; // ✅ UUID
  } | null>(null);


  const [editingAppointment, setEditingAppointment] = useState<any>(null);

  const hours = generateHours("08:00", "20:00", SLOT_MINUTES);

  useEffect(() => {
    if (!isReady) return;
    if (role === "magazzino") return;
    if (activeSalonId == null) return;
    void loadStaff(activeSalonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, role, activeSalonId]);

  useEffect(() => {
    if (!isReady) return;
    if (role === "magazzino") return;
    if (activeSalonId == null) return;
    void loadAppointments(activeSalonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, view, isReady, role, activeSalonId]);

  async function loadStaff(salonId: number) {
    const { data, error } = await supabase
      .from("staff")
      .select("*")
      .eq("active", true)
      .eq("salon_id", salonId)
      .order("name");

    if (error) {
      console.error(error);
      setStaff([{ id: null, name: "Disponibile" }]);
      return;
    }

    const available = [{ id: null, name: "Disponibile" }];
    setStaff(available.concat(data || []));
  }

  function getRangeForView(dateString: string) {
    if (view === "day") {
      return { start: `${dateString}T00:00:00`, end: `${dateString}T23:59:59` };
    }

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

    const { data, error } = await supabase
      .from("appointments")
      .select(
        `
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
      `
      )
      .eq("salon_id", salonId)
      .gte("start_time", range.start)
      .lte("start_time", range.end)
      .order("start_time", { ascending: true });

    if (error) {
      console.error(error);
      setAppointments([]);
      setLoading(false);
      return;
    }

    setAppointments(data || []);
    setLoading(false);
  }

  function handleSlotClick(time: string, staffId: string | null) {
    setSelectedSlot({ time, staffId });
  }


  function handleAppointmentClick(a: any) {
    setEditingAppointment(a);
  }

  if (!isReady) return <div className="px-4 text-white/70">Caricamento…</div>;

  if (role === "magazzino") {
    return (
      <div className="px-4 text-white/70">
        Agenda non disponibile per Magazzino.
      </div>
    );
  }

  if (activeSalonId == null) {
    return <div className="px-4 text-white/70">Nessun salone selezionato.</div>;
  }

  return (
    <div className="w-full">
      {/* TOP BAR */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex items-center gap-2 text-[#f3d8b6]">
          <span className="rounded-2xl p-2 bg-black/20 border border-[#5c3a21]/60">
            <CalendarDays size={18} />
          </span>
          <div className="text-sm text-white/60">
            Vista:
            <span className="ml-2 text-[#f3d8b6] font-semibold">
              {view === "day" ? "Giorno" : "Settimana"}
            </span>
          </div>

          <div className="ml-3 text-xs text-white/40">
            Tip: drag per spostare, drag del bordo per durata (step {SLOT_MINUTES}m).
          </div>
        </div>

        <div className="inline-flex items-center rounded-2xl bg-black/20 border border-[#5c3a21]/60 p-1">
          <button
            onClick={() => setView("day")}
            className={[
              "px-4 py-2 rounded-xl text-sm font-semibold transition",
              view === "day"
                ? "bg-[#f3d8b6] text-[#1A0F0A]"
                : "text-[#f3d8b6] hover:bg-white/5",
            ].join(" ")}
          >
            Giorno
          </button>
          <button
            onClick={() => setView("week")}
            className={[
              "px-4 py-2 rounded-xl text-sm font-semibold transition",
              view === "week"
                ? "bg-[#f3d8b6] text-[#1A0F0A]"
                : "text-[#f3d8b6] hover:bg-white/5",
            ].join(" ")}
          >
            Settimana
          </button>
        </div>
      </div>

      {loading ? (
        <div className="px-2 py-10 text-white/70">Caricamento…</div>
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

/* ========================== DAY VIEW ========================== */

function DayView({
  staff,
  hours,
  appointments,
  onSlotClick,
  onAppointmentClick,
  onAppointmentsChanged,
}: any) {
  const cols = `120px repeat(${staff.length}, minmax(260px, 1fr))`;

  return (
    <div className="rounded-3xl border border-[#5c3a21]/45 bg-black/10 overflow-hidden">
      <div className="overflow-auto">
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          {/* TIME COLUMN */}
          <div className="sticky left-0 z-20 bg-[#140b07]/80 backdrop-blur-md border-r border-[#5c3a21]/45">
            <div className="h-[52px] sticky top-0 z-30 flex items-center justify-end pr-3 bg-[#140b07]/90 border-b border-[#5c3a21]/45">
              <span className="text-xs text-[#f3d8b6]/70">Ora</span>
            </div>

            {hours.map((h: string) => (
              <div
                key={h}
                style={{ height: SLOT_PX }}
                className="flex items-center justify-end pr-3 text-[#f3d8b6]/75 text-sm border-b border-[#2a1811]/60"
              >
                {h.endsWith(":00") || h.endsWith(":30") ? h : ""}
              </div>
            ))}
          </div>

          {/* STAFF COLUMNS */}
          {staff.map((s: any) => {
            const sid = s.id != null ? String(s.id) : null;

            const colAppointments = appointments.filter((a: any) =>
              sid == null ? a.staff_id == null : String(a.staff_id) === sid
            );


            return (
              <div
                key={String(s.id)}
                className="relative border-r border-[#2a1811]/60 bg-[#0f0704]/20"
              >
                {/* sticky header */}
                <div className="h-[52px] sticky top-0 z-30 flex items-center justify-center gap-2 bg-[#140b07]/90 backdrop-blur-md border-b border-[#5c3a21]/45">
                  <Users size={14} className="text-[#f3d8b6]/60" />
                  <div className="text-sm font-extrabold text-[#f3d8b6] truncate px-2">
                    {s.name}
                  </div>
                </div>

                {/* GRID LAYER (clickable slots) */}
                <div className="relative z-10">
                  {hours.map((h: string) => (
                    <div
                      key={h}
                      style={{ height: SLOT_PX }}
                      className="border-b border-[#2a1811]/60 cursor-pointer hover:bg-white/5 transition"
                      onClick={() => onSlotClick(h, s.id != null ? String(s.id) : null)}

                    />
                  ))}
                </div>

                {/* APPOINTMENTS OVERLAY (always on top) */}
                <div className="absolute left-0 right-0 top-[52px] bottom-0 z-40 pointer-events-none">
                  {colAppointments.map((a: any) => (
                    <div key={a.id} className="pointer-events-auto">
                      <AppointmentBox
                        appointment={a}
                        hours={hours}
                        onClick={() => onAppointmentClick(a)}
                        onUpdated={onAppointmentsChanged}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ========================== WEEK VIEW ========================== */

function WeekView({
  hours,
  appointments,
  onSlotClick,
  onAppointmentClick,
  currentDate,
  onAppointmentsChanged,
}: any) {
  const days = generateWeekDaysFromDate(currentDate);
  const cols = `120px repeat(7, minmax(240px, 1fr))`;

  return (
    <div className="rounded-3xl border border-[#5c3a21]/45 bg-black/10 overflow-hidden">
      <div className="overflow-auto">
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          {/* TIME COLUMN */}
          <div className="sticky left-0 z-20 bg-[#140b07]/80 backdrop-blur-md border-r border-[#5c3a21]/45">
            <div className="h-[52px] sticky top-0 z-30 flex items-center justify-end pr-3 bg-[#140b07]/90 border-b border-[#5c3a21]/45">
              <span className="text-xs text-[#f3d8b6]/70">Ora</span>
            </div>

            {hours.map((h: string) => (
              <div
                key={h}
                style={{ height: SLOT_PX }}
                className="flex items-center justify-end pr-3 text-[#f3d8b6]/75 text-sm border-b border-[#2a1811]/60"
              >
                {h.endsWith(":00") || h.endsWith(":30") ? h : ""}
              </div>
            ))}
          </div>

          {/* DAYS */}
          {days.map((d: any) => {
            const dayAppointments = appointments.filter((a: any) =>
              String(a.start_time).startsWith(d.date)
            );

            return (
              <div
                key={d.date}
                className="relative border-r border-[#2a1811]/60 bg-[#0f0704]/20"
              >
                <div className="h-[52px] sticky top-0 z-30 flex items-center justify-center bg-[#140b07]/90 backdrop-blur-md border-b border-[#5c3a21]/45">
                  <div className="text-sm font-extrabold text-[#f3d8b6] truncate px-2">
                    {d.label}
                  </div>
                </div>

                {/* GRID LAYER */}
                <div className="relative z-10">
                  {hours.map((h: string) => (
                    <div
                      key={h}
                      style={{ height: SLOT_PX }}
                      className="border-b border-[#2a1811]/60 cursor-pointer hover:bg-white/5 transition"
                      onClick={() => onSlotClick(h, null)}
                    />
                  ))}
                </div>

                {/* APPOINTMENTS OVERLAY */}
                <div className="absolute left-0 right-0 top-[52px] bottom-0 z-40 pointer-events-none">
                  {dayAppointments.map((a: any) => (
                    <div key={a.id} className="pointer-events-auto">
                      <AppointmentBox
                        appointment={a}
                        hours={hours}
                        onClick={() => onAppointmentClick(a)}
                        onUpdated={onAppointmentsChanged}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
