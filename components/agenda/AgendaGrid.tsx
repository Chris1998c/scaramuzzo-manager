"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
import {
  Loader2,
  RefreshCw,
  LayoutGrid,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type ViewMode = "day" | "week";

function isoDate(d: Date) {
  const y = d.getFullYear();
  const means = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${means}-${day}`;
}

function addDaysISO(dateStr: string, deltaDays: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return isoDate(d);
}

function addWeeksISO(dateStr: string, deltaWeeks: number) {
  return addDaysISO(dateStr, deltaWeeks * 7);
}

function toIdStr(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

export default function AgendaGrid({ currentDate }: { currentDate: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { activeSalonId, isReady } = useActiveSalon();

  // Refs (scroll sync + misura)
  const timeColumnRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const masterRef = useRef<HTMLDivElement>(null);

  // Stati
  const [view, setView] = useState<ViewMode>("day");
  const [staff, setStaff] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modali
  const [selectedSlot, setSelectedSlot] = useState<{
    time: string;
    staffId: string | null;
  } | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);

  // resize tick per ricalcolo colWidth
  const [layoutTick, setLayoutTick] = useState(0);
  useEffect(() => {
    const onResize = () => setLayoutTick((x) => x + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const hours = useMemo(
    () => generateHours("08:00", "20:30", SLOT_MINUTES),
    []
  );

  const weekDays = useMemo(
    () => generateWeekDaysFromDate(currentDate),
    [currentDate]
  );

  /**
   * AUTO-FIT stile Boss:
   * - se sono pochi: colonne si allargano e riempiono tutto (NO BUCHI)
   * - se aumentano: stringe fino a min
   * - se ancora tanti: allora compare scroll orizzontale
   */
  const colWidth = useMemo(() => {
    const count = view === "day" ? staff.length : weekDays.length;

    // fallback
    if (!count) return 280;

    const master = masterRef.current;
    const available = (master?.clientWidth ?? 0) - 80; // 80 = colonna ore
    if (!available) return 280;

    const ideal = Math.floor(available / count);

    // clamp: max 280, min 140 (puoi scendere a 120 se vuoi ancora più stretto)
    return Math.max(140, Math.min(280, ideal));
  }, [view, staff.length, weekDays.length, layoutTick]);

  // width totale contenuto (serve per decidere w-max vs w-full)
  const columnsCount = view === "day" ? staff.length : weekDays.length;
  const contentWidth = 80 + columnsCount * colWidth;
  const masterWidth = masterRef.current?.clientWidth ?? 0;
  const shouldScrollX = contentWidth > masterWidth;

  const loadStaff = useCallback(
    async (salonId: number) => {
      // fallback: colonna virtuale sempre
      const virtual = { id: null, name: "DA ASSEGNARE", is_virtual: true };

      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("salon_id", salonId)
        .eq("active", true)
        .order("name");

      if (error) {
        console.error("Errore caricamento staff:", error);
        setStaff([virtual]);
        return;
      }

      setStaff([virtual, ...(data || [])]);
    },
    [supabase]
  );

  const loadAppointments = useCallback(
    async (salonId: number) => {
      if (!currentDate) return;
      setLoading(true);

      let startRange: string;
      let endRange: string;

      if (view === "day") {
        startRange = `${currentDate}T00:00:00`;
        endRange = `${currentDate}T23:59:59`;
      } else {
        startRange = `${weekDays[0].date}T00:00:00`;
        endRange = `${weekDays[6].date}T23:59:59`;
      }

      const { data, error } = await supabase
        .from("appointments")
        .select(
          `
            *,
            customers:customer_id (*),
            appointment_services (
              *,
              service:service_id (*)
            )
          `
        )
        .eq("salon_id", salonId)
        .gte("start_time", startRange)
        .lte("start_time", endRange);

      if (error) {
        console.error("Errore appuntamenti:", error);
        setAppointments([]);
      } else {
        setAppointments(data || []);
      }

      setLoading(false);
    },
    [currentDate, view, supabase, weekDays]
  );

  useEffect(() => {
    if (!isReady) return;
    if (activeSalonId == null) return;

    loadStaff(activeSalonId);
    loadAppointments(activeSalonId);
  }, [isReady, activeSalonId, currentDate, view, loadStaff, loadAppointments]);

  // Scroll sync
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (timeColumnRef.current) timeColumnRef.current.scrollTop = target.scrollTop;
    if (headerRef.current) headerRef.current.scrollLeft = target.scrollLeft;
  };

  // Nav
  const gotoPrev = () => {
    const next =
      view === "day"
        ? addDaysISO(currentDate, -1)
        : addWeeksISO(currentDate, -1);
    router.push(`/dashboard/agenda?date=${next}`);
  };

  const gotoNext = () => {
    const next =
      view === "day"
        ? addDaysISO(currentDate, 1)
        : addWeeksISO(currentDate, 1);
    router.push(`/dashboard/agenda?date=${next}`);
  };

  const gotoToday = () => {
    const today = isoDate(new Date());
    router.push(`/dashboard/agenda?date=${today}`);
  };

  if (!isReady || activeSalonId == null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0503]">
        <Loader2 className="animate-spin text-[#f3d8b6]" size={40} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0503] text-[#f3d8b6] overflow-hidden p-4 md:p-6">
      {/* TOOLBAR */}
      <div className="flex flex-shrink-0 flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#f3d8b6]/10 rounded-2xl border border-[#f3d8b6]/20">
            <LayoutGrid className="text-[#f3d8b6]" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter leading-none">
              Agenda
            </h1>
            <p className="text-[10px] font-bold opacity-40 uppercase tracking-[0.3em] mt-1">
              {currentDate} • {view === "day" ? "Giorno" : "Settimana"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-black/40 p-1 rounded-2xl border border-white/5 backdrop-blur-xl">
          {/* NAV */}
          <button
            onClick={gotoPrev}
            className="p-2.5 rounded-xl opacity-60 hover:opacity-100 hover:bg-white/5 transition-all"
            title="Precedente"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            onClick={gotoToday}
            className="px-4 py-2.5 rounded-xl text-[11px] font-black transition-all bg-white/5 hover:bg-white/10"
            title="Oggi"
          >
            OGGI
          </button>

          <button
            onClick={gotoNext}
            className="p-2.5 rounded-xl opacity-60 hover:opacity-100 hover:bg-white/5 transition-all"
            title="Successivo"
          >
            <ChevronRight size={16} />
          </button>

          <div className="w-px h-6 bg-white/10 mx-1" />

          {/* VIEW */}
          <button
            onClick={() => setView("day")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black transition-all ${
              view === "day"
                ? "bg-[#f3d8b6] text-black shadow-2xl"
                : "opacity-40 hover:opacity-100"
            }`}
          >
            <LayoutGrid size={14} /> GIORNO
          </button>

          <button
            onClick={() => setView("week")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black transition-all ${
              view === "week"
                ? "bg-[#f3d8b6] text-black shadow-2xl"
                : "opacity-40 hover:opacity-100"
            }`}
          >
            <CalendarIcon size={14} /> SETTIMANA
          </button>

          <div className="w-px h-6 bg-white/10 mx-1" />

          <button
            onClick={() => loadAppointments(activeSalonId)}
            className="p-2.5 rounded-xl opacity-40 hover:opacity-100 hover:bg-white/5 transition-all"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* MASTER */}
      <div
        ref={masterRef}
        className="flex-1 relative bg-[#140b07] rounded-[32px] border border-white/5 shadow-inner overflow-hidden flex flex-col"
      >
        {/* HEADER COLONNE */}
        <div className="flex flex-shrink-0 border-b border-white/5 bg-[#140b07] z-30">
          <div className="w-20 flex-shrink-0 bg-[#140b07] border-r border-white/5" />

          <div ref={headerRef} className="flex-1 overflow-hidden bg-[#140b07]">
            {/* se non serve scroll: w-full (riempie e NON lascia buchi)
                se serve scroll: w-max (per poter scrollare) */}
            <div className={`flex ${shouldScrollX ? "w-max" : "w-full"}`}>
              {view === "day" ? (
                staff.map((s) => (
                  <div
                    key={s?.id != null ? String(s.id) : `virtual-${s.name}`}
                    className="flex-shrink-0 p-4 flex flex-col items-center justify-center border-r border-white/5"
                    style={{
                      width: colWidth,
                      flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                      minWidth: shouldScrollX ? colWidth : undefined,
                    }}
                  >
                    <span className="text-xs font-black uppercase text-white tracking-widest">
                      {s.name}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          s.is_virtual ? "bg-orange-500" : "bg-green-500"
                        }`}
                      />
                      <span className="text-[9px] font-bold opacity-30 uppercase">
                        {s.is_virtual ? "Supporto" : "Operativo"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                weekDays.map((d) => (
                  <div
                    key={d.date}
                    className="flex-shrink-0 p-4 flex flex-col items-center justify-center border-r border-white/5"
                    style={{
                      width: colWidth,
                      flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                      minWidth: shouldScrollX ? colWidth : undefined,
                    }}
                  >
                    <span className="text-[10px] font-bold opacity-40 uppercase">
                      {d.label.split(" ")[0]}
                    </span>
                    <span className="text-sm font-black text-[#f3d8b6]">
                      {d.label.split(" ")[1]}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 flex overflow-hidden relative bg-[#140b07]">
          {/* TIME COL */}
          <div
            ref={timeColumnRef}
            className="w-20 flex-shrink-0 overflow-hidden bg-[#140b07] border-r border-white/5 z-20"
          >
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: SLOT_PX }}
                className="flex flex-col items-center justify-start pt-2 border-b border-white/[0.02]"
              >
                <span className="text-[10px] font-mono font-bold opacity-20">
                  {h.endsWith(":00") || h.endsWith(":30") ? h : ""}
                </span>
              </div>
            ))}
          </div>

          {/* GRID */}
          <div
            ref={gridContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto custom-scrollbar relative bg-[#140b07]"
          >
            {/* stesso concetto header: w-full se no scroll, w-max se serve scroll */}
            <div className={`flex relative bg-[#140b07] ${shouldScrollX ? "w-max" : "w-full"}`}>
              {view === "day"
                ? staff.map((member) => {
                    const mid = toIdStr(member?.id);

                    return (
                      <div
                        key={mid ?? `virtual-${member?.name ?? "na"}`}
                        className="relative border-r border-white/[0.03]"
                        style={{
                          width: colWidth,
                          flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                          minWidth: shouldScrollX ? colWidth : undefined,
                        }}
                      >
                        {hours.map((h) => (
                          <div
                            key={h}
                            style={{ height: SLOT_PX }}
                            className="border-b border-white/[0.02] hover:bg-[#f3d8b6]/[0.02] transition-colors cursor-crosshair"
                            onClick={() =>
                              setSelectedSlot({
                                time: h,
                                staffId: mid,
                              })
                            }
                          />
                        ))}

                        {/* Appuntamenti */}
                        <div className="absolute inset-0 pointer-events-none z-10 p-1">
                          {appointments
                            .filter((a) => {
                              const aid = toIdStr(a?.staff_id);
                              return mid == null ? aid == null : aid === mid;
                            })
                            .map((app) => (
                              <div key={app.id} className="pointer-events-auto">
                                <AppointmentBox
                                  appointment={app}
                                  hours={hours}
                                  onClick={() => setEditingAppointment(app)}
                                  onCashIn={() =>
                                    router.push(`/dashboard/cassa/${app.id}`)
                                  }
                                  onUpdated={() => loadAppointments(activeSalonId)}
                                />
                              </div>
                            ))}
                        </div>
                      </div>
                    );
                  })
                : weekDays.map((day) => (
                    <div
                      key={day.date}
                      className="relative border-r border-white/[0.03]"
                      style={{
                        width: colWidth,
                        flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                        minWidth: shouldScrollX ? colWidth : undefined,
                      }}
                    >
                      {hours.map((h) => (
                        <div
                          key={h}
                          style={{ height: SLOT_PX }}
                          className="border-b border-white/[0.02] hover:bg-white/[0.02] cursor-crosshair"
                          onClick={() => setSelectedSlot({ time: h, staffId: null })}
                        />
                      ))}

                      <div className="absolute inset-0 pointer-events-none z-10 p-1">
                        {appointments
                          .filter((a) =>
                            String(a?.start_time || "").startsWith(day.date)
                          )
                          .map((app) => (
                            <div key={app.id} className="pointer-events-auto">
                              <AppointmentBox
                                appointment={app}
                                hours={hours}
                                onClick={() => setEditingAppointment(app)}
                                onCashIn={() =>
                                  router.push(`/dashboard/cassa/${app.id}`)
                                }
                                onUpdated={() => loadAppointments(activeSalonId)}
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      </div>

      {/* LOADING OVERLAY */}
      {loading && (
        <div className="fixed inset-0 z-[200] bg-black/20 backdrop-blur-[2px] pointer-events-none flex items-center justify-center">
          <div className="bg-[#1c110d] p-4 rounded-2xl border border-[#f3d8b6]/20 shadow-2xl flex items-center gap-3">
            <Loader2 className="animate-spin text-[#f3d8b6]" size={20} />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#f3d8b6]">
              Aggiornamento dati...
            </span>
          </div>
        </div>
      )}

      {/* MODALI */}
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
          selectedDay={currentDate} // ✅ FIX TS
          close={() => setEditingAppointment(null)}
          onUpdated={() => loadAppointments(activeSalonId)}
        />
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(243, 216, 182, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(243, 216, 182, 0.2);
        }
      `}</style>
    </div>
  );
}
