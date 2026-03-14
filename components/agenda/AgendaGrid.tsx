"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import AgendaModal from "./AgendaModal";
import EditAppointmentModal from "./EditAppointmentModal";
import ServiceBox from "./ServiceBox";

import {
  generateHours,
  generateWeekDaysFromDate,
  timeFromTs,
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

/** Durata in minuti da app (start_time/end_time); fallback 30. */
function durationMinutesFromApp(app: any): number {
  const start = app?.start_time;
  const end = app?.end_time;
  if (!start || !end) return 30;
  const a = new Date(String(start).replace("Z", ""));
  const b = new Date(String(end).replace("Z", ""));
  const diff = (b.getTime() - a.getTime()) / 60000;
  return Number.isFinite(diff) && diff >= 15 ? Math.round(diff) : 30;
}

/** Riga virtuale per appuntamenti senza appointment_services (solo uso interno AgendaGrid). */
function createPlaceholderLine(app: any): any {
  return {
    _placeholder: true,
    id: `placeholder-${app?.id ?? "na"}`,
    start_time: app?.start_time ?? "",
    duration_minutes: durationMinutesFromApp(app),
    staff_id: app?.staff_id ?? null,
  };
}

function isPlaceholderLine(line: any): boolean {
  return line && (line._placeholder === true || line.id?.startsWith?.("placeholder-"));
}

/** Badge stato (coerente con ServiceBox, solo per placeholder). */
function placeholderStatusMeta(status: string | null | undefined) {
  const s = String(status || "scheduled");
  if (s === "in_sala") return { label: "IN SALA", cls: "bg-emerald-400 text-black border border-emerald-300/80" };
  if (s === "done") return { label: "COMPLETATO", cls: "bg-white/10 text-white/80 border border-white/20" };
  if (s === "cancelled") return { label: "ANNULLATO", cls: "bg-red-500/15 text-red-200 border border-red-400/40" };
  return { label: "PRENOTATO", cls: "bg-black/40 text-[#f3d8b6] border border-white/20" };
}

/** Box per appuntamento senza servizi: cliccabile, apre EditAppointmentModal. */
function PlaceholderAppointmentBox({
  appointment,
  line,
  hours,
  onClick,
  colWidth,
  isHighlighted,
  laneIndex = 0,
  laneCount = 1,
}: {
  appointment: any;
  line: any;
  hours: string[];
  onClick: () => void;
  colWidth: number;
  isHighlighted?: boolean;
  laneIndex?: number;
  laneCount?: number;
}) {
  const startTime = timeFromTs(line?.start_time ?? "");
  const startIndex = hours.indexOf(startTime);
  const safeStartIndex = startIndex >= 0 ? startIndex : 0;
  const topBase = safeStartIndex * SLOT_PX;
  const durationMin = Number(line?.duration_minutes) || SLOT_MINUTES;
  const rawHeight = (durationMin / SLOT_MINUTES) * SLOT_PX;
  const MIN_HEIGHT = Math.max(56, SLOT_PX * 1.35);
  const height = Math.max(MIN_HEIGHT, rawHeight);

  const w = Math.max(140, Number(colWidth) || 260);
  const laneC = Math.max(1, Number(laneCount) || 1);
  const laneI = Math.max(0, Math.min(laneIndex ?? 0, laneC - 1));
  const PAD_L = 6;
  const PAD_R = 6;
  const GAP = laneC > 1 ? 6 : 0;
  const usableW = Math.max(60, w - PAD_L - PAD_R);
  const laneW = usableW / laneC;
  const boxLeft = PAD_L + laneI * laneW + (GAP ? GAP / 2 : 0);
  const boxWidth = Math.max(56, laneW - (GAP ? GAP : 0));

  const customerName = appointment?.customers
    ? `${appointment.customers.first_name ?? ""} ${appointment.customers.last_name ?? ""}`.trim() || "Cliente"
    : "Cliente";
  const meta = placeholderStatusMeta(appointment?.status);

  return (
    <div
      className={[
        "absolute z-30 rounded-2xl cursor-pointer",
        "bg-scz-dark/95 backdrop-blur-md border border-white/10",
        "shadow-[0_16px_55px_rgba(0,0,0,0.55)]",
        isHighlighted ? "ring-2 ring-[#f3d8b6] shadow-[0_0_24px_rgba(243,216,182,0.35)]" : "ring-1 ring-black/40",
      ].join(" ")}
      style={{ top: topBase, height, left: boxLeft, width: boxWidth }}
      onClick={() => onClick()}
      data-appointment-id={appointment?.id != null ? String(appointment.id) : undefined}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[7px] bg-white/20 rounded-l-2xl" />
      <div className="relative z-10 h-full pl-5 pr-3 py-2 flex flex-col justify-center gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono font-black text-white/90">{startTime || "—"}</span>
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
        <h4 className="font-extrabold text-[#f3d8b6] truncate text-[13px]">{customerName}</h4>
        <p className="text-[11px] text-white/60">Nessun servizio</p>
      </div>
    </div>
  );
}

type AgendaGridProps = {
  currentDate: string;
  highlightAppointmentId?: string | null;
  onHighlightHandled?: () => void;
};

export default function AgendaGrid({ currentDate, highlightAppointmentId, onHighlightHandled }: AgendaGridProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { activeSalonId, isReady } = useActiveSalon();

  // Refs (scroll sync + misura)
  const timeColumnRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const masterRef = useRef<HTMLDivElement>(null);

  // ✅ misura reale colonna (quando NON c’è scrollX e le colonne sono flex)
  const dayProbeRef = useRef<HTMLDivElement>(null);
  const [colWidthRealDay, setColWidthRealDay] = useState<number | null>(null);

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

  // Scroll e highlight per ?highlight=<appointmentId>
  useEffect(() => {
    if (!highlightAppointmentId || loading) return;
    const id = String(highlightAppointmentId).trim();
    if (!id) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-appointment-id="${id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
      onHighlightHandled?.();
    }, 400);
    return () => clearTimeout(timer);
  }, [highlightAppointmentId, loading, onHighlightHandled]);

  // resize tick per ricalcolo (solo per ricalcoli memo)
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

  // ordine colonne staff (include null per "DA ASSEGNARE")
  const staffOrder = useMemo(
    () => staff.map((s: any) => toIdStr(s?.id)),
    [staff]
  );

  /**
   * BASE colWidth "ideale" (usata quando scrollX è attivo)
   */
  const colWidth = useMemo(() => {
    const count = view === "day" ? staff.length : weekDays.length;
    if (!count) return 280;

    const master = masterRef.current;
    const available = (master?.clientWidth ?? 0) - 80; // 80 = colonna ore
    if (!available) return 280;

    const ideal = Math.floor(available / count);
    return Math.max(140, Math.min(280, ideal));
  }, [view, staff.length, weekDays.length, layoutTick]);

  // colonne visibili (day = staff, week = 7 giorni)
  const columnsCount = view === "day" ? staff.length : weekDays.length;

  // larghezza contenuto teorica (usando colWidth base)
  const contentWidth = 80 + columnsCount * colWidth;
  const masterWidth = masterRef.current?.clientWidth ?? 0;
  const shouldScrollX = contentWidth > masterWidth;

  /**
   * ✅ LARGHEZZA COLONNA REALE in DAY:
   * - se scrollX: colWidth è reale
   * - se NO scrollX: usiamo una MISURA reale dal DOM (ResizeObserver su dayProbeRef)
   */
  const dayColWidth = useMemo(() => {
    if (view !== "day") return colWidth;
    if (shouldScrollX) return colWidth;

    const m = colWidthRealDay;
    if (m && Number.isFinite(m) && m > 0) return Math.floor(m);

    // fallback (solo finché non abbiamo misurato)
    const master = masterRef.current;
    const available = (master?.clientWidth ?? 0) - 80;
    if (!available || !staff.length) return colWidth;
    return Math.floor(available / staff.length);
  }, [view, shouldScrollX, colWidth, staff.length, colWidthRealDay, layoutTick]);

  // ✅ misura colonna reale con ResizeObserver (solo day + no scrollX)
  useEffect(() => {
    if (view !== "day") {
      setColWidthRealDay(null);
      return;
    }

    if (shouldScrollX) {
      // quando scrollX, la width è già “fissa” (colWidth) e coerente
      setColWidthRealDay(null);
      return;
    }

    const probe = dayProbeRef.current;
    if (!probe) return;

    let raf = 0;

    const measure = () => {
      // rAF per evitare “layout thrash” su resize/observer burst
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = probe.getBoundingClientRect().width;
        if (Number.isFinite(w) && w > 0) setColWidthRealDay(w);
      });
    };

    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(probe);

    // osserva anche il master perché padding/border/layout possono cambiare
    if (masterRef.current) ro.observe(masterRef.current);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [view, shouldScrollX, staff.length, layoutTick]);

  // ===== DATA LOADING =====

  const loadStaff = useCallback(
    async (salonId: number) => {
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
          id,
          start_time,
          end_time,
          status,
          notes,
          salon_id,
          staff_id,
          customer_id,
          customers:customer_id (
            id, first_name, last_name, phone
          ),
          appointment_services:appointment_services (
            id,
            appointment_id,
            service_id,
            staff_id,
            start_time,
            duration_minutes,
            price,
            vat_rate,
            services:service_id (
              id, name, color_code, duration
            )
          )
        `
        )
        .eq("salon_id", salonId)
        .gte("start_time", startRange)
        .lte("start_time", endRange)
        .order("start_time", { ascending: true })
        .order("start_time", {
          foreignTable: "appointment_services",
          ascending: true,
        });

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

  // ===== PERF: pre-flatten linee una volta sola (include placeholder per app senza servizi) =====
  const dayLinesByStaff = useMemo(() => {
    if (view !== "day")
      return new Map<string | null, Array<{ app: any; line: any }>>();

    const map = new Map<string | null, Array<{ app: any; line: any }>>();
    for (const app of appointments || []) {
      const lines = Array.isArray(app?.appointment_services)
        ? app.appointment_services
        : [];
      if (lines.length > 0) {
        for (const line of lines) {
          const sid = toIdStr(line?.staff_id);
          const key = sid ?? null;
          const arr = map.get(key) ?? [];
          arr.push({ app, line });
          map.set(key, arr);
        }
      } else {
        const placeholder = createPlaceholderLine(app);
        const key = toIdStr(app?.staff_id) ?? null;
        const arr = map.get(key) ?? [];
        arr.push({ app, line: placeholder });
        map.set(key, arr);
      }
    }
    return map;
  }, [appointments, view]);

  const weekLinesByDay = useMemo(() => {
    if (view !== "week")
      return new Map<string, Array<{ app: any; line: any }>>();

    const map = new Map<string, Array<{ app: any; line: any }>>();
    for (const day of weekDays) map.set(day.date, []);

    for (const app of appointments || []) {
      const dayKey = String(app?.start_time || "").slice(0, 10);
      if (!dayKey || !map.has(dayKey)) continue;

      const lines = Array.isArray(app?.appointment_services)
        ? app.appointment_services
        : [];
      if (lines.length > 0) {
        for (const line of lines) {
          map.get(dayKey)!.push({ app, line });
        }
      } else {
        map.get(dayKey)!.push({ app, line: createPlaceholderLine(app) });
      }
    }
    return map;
  }, [appointments, view, weekDays]);

  // Scroll sync
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (timeColumnRef.current) timeColumnRef.current.scrollTop = target.scrollTop;
    if (headerRef.current) headerRef.current.scrollLeft = target.scrollLeft;
  };

  // Nav
  const gotoPrev = () => {
    const next =
      view === "day" ? addDaysISO(currentDate, -1) : addWeeksISO(currentDate, -1);
    router.push(`/dashboard/agenda?date=${next}`);
  };

  const gotoNext = () => {
    const next =
      view === "day" ? addDaysISO(currentDate, 1) : addWeeksISO(currentDate, 1);
    router.push(`/dashboard/agenda?date=${next}`);
  };

  const gotoToday = () => {
    const today = isoDate(new Date());
    router.push(`/dashboard/agenda?date=${today}`);
  };

  const displayDateLabel = useMemo(
    () =>
      currentDate
        ? new Date(currentDate + "T00:00:00").toLocaleDateString("it-IT", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })
        : "",
    [currentDate]
  );

  // griglia verticale totale (limite ServiceBox)
  const gridHeightPx = useMemo(() => hours.length * SLOT_PX, [hours]);

  if (!isReady || activeSalonId == null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-scz-darker">
        <Loader2 className="animate-spin text-[#f3d8b6]" size={40} />
      </div>
    );
  }

  // ===============================
  // COLLISION / STACKING ENGINE
  // ===============================

  function minutesFromTimeStr(ts: string) {
    const raw = String(ts || "");
    const timePart = raw.includes("T") ? raw.split("T")[1] : raw.split(" ")[1];
    const time = timePart || "00:00:00";
    const [hh, mm] = time.split(":").map(Number);
    return (hh || 0) * 60 + (mm || 0);
  }

function buildLanes(
  pairs: Array<{ app: any; line: any }>
): Array<{ app: any; line: any; laneIndex: number; laneCount: number }> {
  if (!pairs.length) return [];

  const base = pairs.map((p) => ({
    app: p.app,
    line: p.line,
    laneIndex: 0,
    laneCount: 1,
  }));

  const items = pairs
    .map((p, idx) => {
      const start = minutesFromTimeStr(p.line?.start_time);

      const raw =
        Number(p.line?.duration_minutes ?? p.line?.services?.duration ?? 30) ||
        30;

      // deve matchare ServiceBox MIN_HEIGHT
      const MIN_HEIGHT_PX = Math.max(56, SLOT_PX * 1.35);
      const minSlots = Math.ceil(MIN_HEIGHT_PX / SLOT_PX);
      const minDur = minSlots * SLOT_MINUTES;

      const duration = Math.max(raw, minDur);
      const end = start + duration;

      return { idx, start, end };
    })
    .sort((a, b) => a.start - b.start);

  type Active = { idx: number; end: number; lane: number };
  const active: Active[] = [];
  let currentMaxLanes = 1;

  for (const item of items) {
    // 1) rimuovi eventi terminati
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= item.start) active.splice(i, 1);
    }

    // ✅ 2) se cluster finito, resetta la larghezza (Google-style)
    if (active.length === 0) {
      currentMaxLanes = 1;
    }

    // 3) trova prima lane libera
    let lane = 0;
    const used = new Set(active.map((a) => a.lane));
    while (used.has(lane)) lane++;

    active.push({ idx: item.idx, end: item.end, lane });

    // 4) calcola quante lane servono nel cluster corrente
    currentMaxLanes = Math.max(
      currentMaxLanes,
      Math.max(...active.map((a) => a.lane)) + 1
    );

    // 5) assegna laneIndex/laneCount al corrente
    base[item.idx].laneIndex = lane;
    base[item.idx].laneCount = currentMaxLanes;

    // 6) aggiorna anche tutti gli attivi (così pure i primi si stringono)
    for (const a of active) {
      base[a.idx].laneCount = currentMaxLanes;
    }
  }

  return base;
}






  return (
    <div className="flex flex-col h-full w-full bg-scz-darker text-[#f3d8b6] overflow-hidden p-4 md:p-6">
      {/* TOOLBAR */}
      <div className="flex flex-shrink-0 flex-col md:flex-row md:items-center justify-between gap-4 mb-4 md:mb-6">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2.5 md:p-3 rounded-xl border border-white/10 bg-black/20">
            <LayoutGrid className="text-[#f3d8b6]" size={22} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
              Vista
            </div>
            <p className="text-sm md:text-base font-black text-white/90 mt-0.5">
              {displayDateLabel || currentDate} · {view === "day" ? "Giorno" : "Settimana"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-1.5 md:p-2">
          <button
            onClick={gotoPrev}
            className="p-2.5 rounded-xl text-white/60 hover:text-[#f3d8b6] hover:bg-white/10 transition-colors"
            title="Precedente"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={gotoToday}
            className="h-11 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider bg-white/10 hover:bg-white/15 text-white/90 transition-colors"
            title="Oggi"
          >
            Oggi
          </button>
          <button
            onClick={gotoNext}
            className="p-2.5 rounded-xl text-white/60 hover:text-[#f3d8b6] hover:bg-white/10 transition-colors"
            title="Successivo"
          >
            <ChevronRight size={16} />
          </button>
          <div className="w-px h-6 bg-white/10 mx-0.5" />
          <button
            onClick={() => setView("day")}
            className={`flex items-center gap-2 h-11 px-4 md:px-5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${view === "day"
              ? "bg-[#f3d8b6] text-black"
              : "text-white/50 hover:text-white/80 hover:bg-white/10"
              }`}
          >
            <LayoutGrid size={14} /> Giorno
          </button>
          <button
            onClick={() => setView("week")}
            className={`flex items-center gap-2 h-11 px-4 md:px-5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${view === "week"
              ? "bg-[#f3d8b6] text-black"
              : "text-white/50 hover:text-white/80 hover:bg-white/10"
              }`}
          >
            <CalendarIcon size={14} /> Settimana
          </button>
          <div className="w-px h-6 bg-white/10 mx-0.5" />
          <button
            onClick={() => loadAppointments(activeSalonId)}
            className="p-2.5 rounded-xl text-white/50 hover:text-[#f3d8b6] hover:bg-white/10 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* MASTER GRID CONTAINER */}
      <div
        ref={masterRef}
        className="flex-1 min-h-0 relative overflow-hidden flex flex-col rounded-2xl border border-white/10 bg-scz-dark shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)]"
      >
        {/* HEADER COLONNE */}
        <div className="flex flex-shrink-0 border-b border-white/10 bg-black/20 z-30">
          <div className="w-20 flex-shrink-0 bg-black/20 border-r border-white/10" />
          <div ref={headerRef} className="flex-1 overflow-hidden bg-black/20">
            <div className={`flex ${shouldScrollX ? "w-max" : "w-full"}`}>
              {view === "day"
                ? staff.map((s: any, idx: number) => (
                  <div
                    key={s?.id != null ? String(s.id) : `virtual-${s.name}`}
                    ref={idx === 0 ? dayProbeRef : undefined}
                    className="flex-shrink-0 px-3 md:p-4 flex flex-col items-center justify-center border-r border-white/10"
                    style={{
                      width: shouldScrollX ? colWidth : dayColWidth,
                      flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                      minWidth: shouldScrollX ? colWidth : undefined,
                    }}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider text-white/90">
                      {s.name}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${s.is_virtual ? "bg-orange-500" : "bg-green-500"
                          }`}
                      />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
                        {s.is_virtual ? "Supporto" : "Operativo"}
                      </span>
                    </div>
                  </div>
                ))
                : weekDays.map((d: any) => (
                  <div
                    key={d.date}
                    className="flex-shrink-0 px-3 md:p-4 flex flex-col items-center justify-center border-r border-white/10"
                    style={{
                      width: colWidth,
                      flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                      minWidth: shouldScrollX ? colWidth : undefined,
                    }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                      {d.label.split(" ")[0]}
                    </span>
                    <span className="text-sm font-black text-[#f3d8b6] mt-0.5">
                      {d.label.split(" ")[1]}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 flex overflow-hidden relative bg-scz-dark min-h-0">
          <div
            ref={timeColumnRef}
            className="w-20 flex-shrink-0 overflow-hidden bg-scz-dark border-r border-white/10 z-20"
          >
            {hours.map((h: string) => (
              <div
                key={h}
                style={{ height: SLOT_PX }}
                className="flex flex-col items-center justify-start pt-2 border-b border-white/5"
              >
                <span className="text-[10px] font-mono font-bold text-white/40">
                  {h.endsWith(":00") || h.endsWith(":30") ? h : ""}
                </span>
              </div>
            ))}
          </div>
          <div
            ref={gridContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto custom-scrollbar relative bg-scz-dark"
          >
            <div
              className={`flex relative bg-scz-dark ${shouldScrollX ? "w-max" : "w-full"
                }`}
            >
              {view === "day"
                ? staff.map((member: any, colIdx: number) => {
                  const mid = toIdStr(member?.id);

                  const columnWidth = shouldScrollX ? colWidth : dayColWidth;

                  const columnKey = mid ?? null;
                  const pairs = dayLinesByStaff.get(columnKey) ?? [];

                  const laid = buildLanes(pairs);
                  return (
                    <div
                      key={mid ?? `virtual-${member?.name ?? "na"}`}
                      className="relative border-r border-white/5"
                      style={{
                        width: columnWidth,
                        flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                        minWidth: shouldScrollX ? columnWidth : undefined,
                      }}
                    >
                      {hours.map((h: string) => (
                        <div
                          key={h}
                          style={{ height: SLOT_PX }}
                          className="border-b border-white/5 hover:bg-[#f3d8b6]/5 transition-colors cursor-crosshair"
                          onClick={() =>
                            setSelectedSlot({ time: h, staffId: mid })
                          }
                        />
                      ))}

                      <div className="absolute inset-0 pointer-events-none z-10 p-1">

                        {laid.map(({ app, line, laneIndex, laneCount }: any) => (
                          <div
                            key={String(line.id)}
                            className="pointer-events-auto"
                            data-appointment-id={app?.id != null ? String(app.id) : undefined}
                          >
                            {isPlaceholderLine(line) ? (
                              <PlaceholderAppointmentBox
                                appointment={app}
                                line={line}
                                hours={hours}
                                onClick={() => setEditingAppointment(app)}
                                colWidth={columnWidth}
                                isHighlighted={highlightAppointmentId != null && String(app?.id) === String(highlightAppointmentId)}
                                laneIndex={laneIndex}
                                laneCount={laneCount}
                              />
                            ) : (
                              <ServiceBox
                                appointment={app}
                                line={line}
                                hours={hours}
                                onClick={() => setEditingAppointment(app)}
                                onUpdated={() => loadAppointments(activeSalonId)}
                                enableHorizontal={true}
                                colWidth={columnWidth}
                                columnIndex={colIdx}
                                columnsCount={staff.length}
                                gridHeightPx={gridHeightPx}
                                columnStaffId={mid}
                                staffOrder={staffOrder}
                                laneIndex={laneIndex}
                                laneCount={laneCount}
                                isHighlighted={highlightAppointmentId != null && String(app?.id) === String(highlightAppointmentId)}
                              />
                            )}
                          </div>
                        ))}

                      </div>
                    </div>
                  );
                })
                : weekDays.map((day: any, colIdx: number) => {
                  const dayPairs = weekLinesByDay.get(day.date) ?? [];

                  return (
                    <div
                      key={day.date}
                      className="relative border-r border-white/5"
                      style={{
                        width: colWidth,
                        flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                        minWidth: shouldScrollX ? colWidth : undefined,
                      }}
                    >
                      {hours.map((h: string) => (
                        <div
                          key={h}
                          style={{ height: SLOT_PX }}
                          className="border-b border-white/5 hover:bg-white/5 cursor-crosshair transition-colors"
                          onClick={() =>
                            setSelectedSlot({ time: h, staffId: null })
                          }
                        />
                      ))}

                      <div className="absolute inset-0 pointer-events-none z-10 p-1">
                        {dayPairs.map(({ app, line }: any) => (
                          <div
                            key={line.id}
                            className="pointer-events-auto"
                            data-appointment-id={app?.id != null ? String(app.id) : undefined}
                          >
                            {isPlaceholderLine(line) ? (
                              <PlaceholderAppointmentBox
                                appointment={app}
                                line={line}
                                hours={hours}
                                onClick={() => setEditingAppointment(app)}
                                colWidth={colWidth}
                                isHighlighted={highlightAppointmentId != null && String(app?.id) === String(highlightAppointmentId)}
                              />
                            ) : (
                              <ServiceBox
                                appointment={app}
                                line={line}
                                hours={hours}
                                onClick={() => setEditingAppointment(app)}
                                onUpdated={() => loadAppointments(activeSalonId)}
                                enableHorizontal={false}
                                colWidth={colWidth}
                                columnIndex={colIdx}
                                columnsCount={weekDays.length}
                                gridHeightPx={gridHeightPx}
                                columnStaffId={null}
                                staffOrder={staffOrder}
                                isHighlighted={highlightAppointmentId != null && String(app?.id) === String(highlightAppointmentId)}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      {/* LOADING OVERLAY */}
      {loading && (
        <div className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-[2px] pointer-events-none flex items-center justify-center">
          <div className="rounded-2xl border border-white/10 bg-scz-dark px-5 py-4 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)] flex items-center gap-3">
            <Loader2 className="animate-spin text-[#f3d8b6]" size={20} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
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
          selectedDay={currentDate}
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
