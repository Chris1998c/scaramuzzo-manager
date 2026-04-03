"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";
import {
  fetchStaffScheduleForSalon,
  isoDayOfWeekFromISODateLocal,
  isStaffVisibleOnAgendaDayForSalon,
} from "@/lib/staffSchedule";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import AgendaModal from "./AgendaModal";
import EditAppointmentModal from "./EditAppointmentModal";
import ServiceBox from "./ServiceBox";
import CalendarModal from "./CalendarModal";
import {
  AGENDA_LIST_SELECT,
  normalizeAgendaRows,
  type AgendaAppointment,
  type AgendaServiceLine,
} from "@/lib/agenda/agendaContract";

import {
  agendaGridDayStartLabel,
  generateHours,
  generateWeekDaysFromDate,
  timeFromTs,
  timeToMinutes,
  SLOT_MINUTES,
} from "./utils";
import { AgendaSlotPxProvider, useAgendaSlotPx } from "./AgendaSlotPxContext";
import {
  Loader2,
  RefreshCw,
  LayoutGrid,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
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

/** Durata placeholder: da header start/end; fallback SLOT_MINUTES. */
function durationMinutesFromApp(app: AgendaAppointment): number {
  const start = app?.start_time;
  const end = app?.end_time;
  if (!start || !end) return SLOT_MINUTES;
  const a = new Date(String(start).replace("Z", ""));
  const b = new Date(String(end).replace("Z", ""));
  const diff = (b.getTime() - a.getTime()) / 60000;
  return Number.isFinite(diff) && diff >= SLOT_MINUTES ? Math.round(diff) : SLOT_MINUTES;
}

/** Riga virtuale per appuntamenti senza appointment_services (solo uso interno AgendaGrid). */
function createPlaceholderLine(app: AgendaAppointment): Record<string, unknown> {
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
  agendaContextDay: _agendaContextDay = null,
}: {
  appointment: AgendaAppointment;
  line: Record<string, unknown>;
  hours: string[];
  onClick: () => void;
  colWidth: number;
  isHighlighted?: boolean;
  laneIndex?: number;
  laneCount?: number;
  agendaContextDay?: string | null;
}) {
  const slotPx = useAgendaSlotPx();
  const startTime = timeFromTs(String(line?.start_time ?? ""));
  const startIndex = hours.indexOf(startTime);
  const safeStartIndex = startIndex >= 0 ? startIndex : 0;
  const topBase = safeStartIndex * slotPx;
  const durationMin = Number(line?.duration_minutes) || SLOT_MINUTES;
  const rawHeight = (durationMin / SLOT_MINUTES) * slotPx;
  const MIN_HEIGHT = Math.max(56, slotPx * 1.35);
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

  const customerName =
    (appointment?.customers
      ? `${appointment.customers.first_name ?? ""} ${appointment.customers.last_name ?? ""}`.trim()
      : "") || "Cliente";
  const meta = placeholderStatusMeta(appointment?.status);

  return (
    <div
      className={[
        "absolute z-20 rounded-xl cursor-pointer",
        "bg-scz-dark border border-white/15 shadow-lg",
        isHighlighted ? "ring-2 ring-[#f3d8b6]" : "ring-1 ring-white/10",
      ].join(" ")}
      style={{ top: topBase, height, left: boxLeft, width: boxWidth }}
      onClick={() => onClick()}
      data-appointment-id={appointment?.id != null ? String(appointment.id) : undefined}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[5px] bg-white/25 rounded-l-xl" />
      <div className="relative z-10 h-full pl-4 pr-3 py-2 flex flex-col justify-center gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-mono font-bold text-white/90">{startTime || "—"}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded shrink-0 ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
        <h4 className="font-extrabold text-[#f3d8b6] truncate text-sm">{customerName}</h4>
        <p className="text-xs text-white/65">Nessun servizio registrato</p>
      </div>
    </div>
  );
}

type AgendaGridProps = {
  currentDate: string;
  highlightAppointmentId?: string | null;
  onHighlightHandled?: () => void;
};

export default function AgendaGrid(props: AgendaGridProps) {
  return (
    <AgendaSlotPxProvider>
      <AgendaGridInner {...props} />
    </AgendaSlotPxProvider>
  );
}

function AgendaGridInner({ currentDate, highlightAppointmentId, onHighlightHandled }: AgendaGridProps) {
  const slotPx = useAgendaSlotPx();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeSalonId, isReady } = useActiveSalon();

  const navigateAgendaDate = useCallback(
    (nextDate: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", nextDate);
      router.replace(`/dashboard/agenda?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

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
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);
  /** Per salone attivo: staff_id → giorni ISO (1–7) con orario; assente → tutti i giorni (legacy). */
  const [staffScheduleByStaffId, setStaffScheduleByStaffId] = useState<
    Map<string, Set<number>>
  >(() => new Map());

  // Modali
  const [selectedSlot, setSelectedSlot] = useState<{
    time: string;
    staffId: string | null;
  } | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AgendaAppointment | null>(null);

  /** Evidenza colonna / fascia oraria durante drag appuntamento (solo vista giorno). */
  const [agendaDragCol, setAgendaDragCol] = useState<number | null>(null);
  const [agendaDragSlot, setAgendaDragSlot] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    setAgendaDragCol(null);
    setAgendaDragSlot(null);
  }, [view]);

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

  const hours = useMemo(() => {
    const start = agendaGridDayStartLabel(activeSalonId ?? 0);
    return generateHours(start, "20:30", SLOT_MINUTES);
  }, [activeSalonId]);
  const weekDays = useMemo(
    () => generateWeekDaysFromDate(currentDate),
    [currentDate]
  );

  useEffect(() => {
    if (view !== "day" || currentDate !== isoDate(new Date())) return;
    const id = window.setInterval(() => setNowTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, [view, currentDate]);

  const isAgendaToday = view === "day" && currentDate === isoDate(new Date());

  const currentTimeLineTopPx = useMemo(() => {
    if (!isAgendaToday || !hours.length) return null;
    const now = new Date();
    const nowDec = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const startM = timeToMinutes(hours[0]);
    const minutesFromStart = nowDec - startM;
    const gridMaxPx = hours.length * slotPx;
    const topPx = (minutesFromStart / SLOT_MINUTES) * slotPx;
    if (topPx < -1 || topPx > gridMaxPx + 1) return null;
    return topPx;
  }, [isAgendaToday, hours, slotPx, nowTick]);

  const dayGridStaff = useMemo(() => {
    if (view !== "day") return staff;

    const assignable =
      staff.length > 0 && staff[0]?.is_virtual === true ? staff.slice(1) : [...staff];
    const dow = isoDayOfWeekFromISODateLocal(currentDate);
    const poolAssignable =
      dow >= 1 && dow <= 7
        ? assignable.filter((s) => {
            const id = toIdStr(s?.id);
            return id ? isStaffVisibleOnAgendaDayForSalon(staffScheduleByStaffId, id, dow) : false;
          })
        : assignable;

    const unassignedCol = [{ id: null, name: "Non assegnato", is_virtual: true }];

    const collaborators = [...poolAssignable].sort((a, b) =>
      String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "it", { sensitivity: "base" })
    );

    return [...unassignedCol, ...collaborators];
  }, [view, staff, staffScheduleByStaffId, currentDate]);

  // ordine colonne staff per drag orizzontale / posizionamento (giorno = colonne visibili; settimana = lista completa)
  const staffOrderFull = useMemo(
    () => staff.map((s: any) => toIdStr(s?.id)),
    [staff]
  );

  const dayStaffOrder = useMemo(
    () => dayGridStaff.map((s: any) => toIdStr(s?.id)),
    [dayGridStaff]
  );

  /** Ordine id staff (vista settimana / drag orizzontale disattivato ma API coerente). */
  const weekStaffOrderByDayDate = useMemo(() => {
    if (view !== "week") return null;
    const assignable =
      staff.length > 0 && staff[0]?.is_virtual === true ? staff.slice(1) : [...staff];
    const out = new Map<string, (string | null)[]>();
    for (const day of weekDays) {
      const dow = isoDayOfWeekFromISODateLocal(day.date);
      const pool =
        dow >= 1 && dow <= 7
          ? assignable.filter((s) => {
              const id = toIdStr(s?.id);
              return id ? isStaffVisibleOnAgendaDayForSalon(staffScheduleByStaffId, id, dow) : false;
            })
          : assignable;
      const sorted = [...pool].sort((a, b) =>
        String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "it", { sensitivity: "base" })
      );
      const ids = sorted.map((s) => toIdStr(s?.id));
      const hasUn = (appointments || []).some((app) => {
        const dk = String(app.start_time || "").slice(0, 10);
        if (dk !== day.date) return false;
        const lines = app.appointment_services ?? [];
        if (lines.length === 0) return app.staff_id == null;
        return lines.some((ln: AgendaServiceLine) => ln.staff_id == null);
      });
      out.set(day.date, hasUn ? [null, ...ids] : ids);
    }
    return out;
  }, [view, weekDays, staff, staffScheduleByStaffId, appointments]);

  /**
   * BASE colWidth "ideale" (usata quando scrollX è attivo)
   */
  const colWidth = useMemo(() => {
    const count = view === "day" ? dayGridStaff.length : weekDays.length;
    if (!count) return 280;

    const master = masterRef.current;
    const available = (master?.clientWidth ?? 0) - 80; // 80 = colonna ore
    if (!available) return 280;

    const ideal = Math.floor(available / count);
    return Math.max(140, Math.min(280, ideal));
  }, [view, dayGridStaff.length, weekDays.length, layoutTick]);

  // colonne visibili (day = tutti i collaboratori del giorno + non assegnato; week = 7 giorni)
  const columnsCount = view === "day" ? dayGridStaff.length : weekDays.length;

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
    if (!available || !dayGridStaff.length) return colWidth;
    return Math.floor(available / dayGridStaff.length);
  }, [view, shouldScrollX, colWidth, dayGridStaff.length, colWidthRealDay, layoutTick]);

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
  }, [view, shouldScrollX, dayGridStaff.length, layoutTick]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (activeSalonId == null) return;
      const m = await fetchStaffScheduleForSalon(supabase, activeSalonId);
      if (!cancelled) setStaffScheduleByStaffId(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSalonId, supabase]);

  // ===== DATA LOADING =====

  const loadStaff = useCallback(
    async (salonId: number) => {
      try {
        const rows = await fetchActiveStaffForSalon(supabase, salonId, "*");
        setStaff((rows as any[]) ?? []);
      } catch (error) {
        console.error("Errore caricamento staff:", error);
        setStaff([]);
      }
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

      const { data: raw, error } = await supabase
        .from("appointments")
        .select(AGENDA_LIST_SELECT)
        .eq("salon_id", salonId)
        .gte("start_time", startRange)
        .lte("start_time", endRange)
        .order("start_time", { ascending: true })
        .order("start_time", {
          foreignTable: "appointment_services",
          ascending: true,
        });

      if (error) {
        console.error("Errore appuntamenti:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        });
        setAppointments([]);
        setLoading(false);
        return;
      }

      setAppointments(normalizeAgendaRows((raw ?? []) as unknown[]));
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
      const lines = Array.isArray(app?.appointment_services)
        ? app.appointment_services
        : [];
      if (lines.length > 0) {
        for (const line of lines) {
          const dayKey = String(line?.start_time || "").slice(0, 10);
          if (!dayKey || !map.has(dayKey)) continue;
          map.get(dayKey)!.push({ app, line });
        }
      } else {
        const dayKey = String(app?.start_time || "").slice(0, 10);
        if (!dayKey || !map.has(dayKey)) continue;
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

  // Nav (replace + preserva altri query come l’header: niente stack history “a giorni”)
  const gotoPrev = () => {
    const next =
      view === "day" ? addDaysISO(currentDate, -1) : addWeeksISO(currentDate, -1);
    navigateAgendaDate(next);
  };

  const gotoNext = () => {
    const next =
      view === "day" ? addDaysISO(currentDate, 1) : addWeeksISO(currentDate, 1);
    navigateAgendaDate(next);
  };

  const gotoToday = () => {
    navigateAgendaDate(isoDate(new Date()));
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
  const gridHeightPx = useMemo(() => hours.length * slotPx, [hours, slotPx]);

  // Cambio salone: evita scrollTop “sporco” rispetto alla nuova altezza griglia
  useEffect(() => {
    if (activeSalonId == null) return;
    const grid = gridContainerRef.current;
    const timeCol = timeColumnRef.current;
    if (grid) grid.scrollTop = 0;
    if (timeCol) timeCol.scrollTop = 0;
  }, [activeSalonId]);

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
        Number(p.line?.duration_minutes ?? p.line?.services?.duration ?? SLOT_MINUTES) ||
        SLOT_MINUTES;

      // deve matchare ServiceBox MIN_HEIGHT
      const MIN_HEIGHT_PX = Math.max(56, slotPx * 1.35);
      const minSlots = Math.ceil(MIN_HEIGHT_PX / slotPx);
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
    <div className="flex flex-col h-full w-full bg-scz-darker text-[#f3d8b6] overflow-hidden p-3 md:p-5">
      {/* TOOLBAR */}
      <div className="flex flex-shrink-0 flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-3 mb-2.5 md:mb-4">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
            Vista
          </div>
          <p className="text-sm md:text-base font-black text-white/90 mt-0.5">
            {displayDateLabel || currentDate} · {view === "day" ? "Giorno" : "Settimana"}
          </p>
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
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="p-2.5 rounded-xl text-white/50 hover:text-[#f3d8b6] hover:bg-white/10 transition-colors"
            title="Scegli data"
          >
            <CalendarDays size={16} />
          </button>
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
        <div className="flex flex-shrink-0 border-b border-white/[0.22] bg-black/20 z-30">
          <div className="w-20 flex-shrink-0 bg-black/20 border-r border-white/25" />
          <div ref={headerRef} className="flex-1 overflow-hidden bg-black/20">
            <div className={`flex ${shouldScrollX ? "w-max" : "w-full"}`}>
              {view === "day"
                ? dayGridStaff.map((s: any, idx: number) => (
                  <div
                    key={s?.id != null ? String(s.id) : `col-${s.name}`}
                    ref={idx === 0 ? dayProbeRef : undefined}
                    className={[
                      "flex-shrink-0 flex flex-col items-center justify-center px-2 py-3 border-r border-white/[0.22] transition-[background-color,box-shadow] duration-150",
                      agendaDragCol != null && agendaDragCol === idx
                        ? "bg-[#f3d8b6]/[0.14] shadow-[inset_0_0_42px_rgba(243,216,182,0.14)] ring-2 ring-inset ring-[#f3d8b6]/45"
                        : "",
                    ].join(" ")}
                    style={{
                      width: shouldScrollX ? colWidth : dayColWidth,
                      flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                      minWidth: shouldScrollX ? colWidth : undefined,
                    }}
                  >
                    <span className="text-xs font-black uppercase tracking-wider text-white/90 truncate text-center">
                      {s.name}
                    </span>
                    {s.is_virtual ? (
                      <span className="text-[10px] text-white/45 mt-0.5">Senza collaboratore</span>
                    ) : null}
                  </div>
                ))
                : weekDays.map((d: any) => (
                  <div
                    key={d.date}
                    className="flex-shrink-0 px-3 md:p-4 flex flex-col items-center justify-center border-r border-white/[0.22]"
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
            className="w-20 flex-shrink-0 overflow-hidden bg-scz-dark border-r border-white/25 z-20"
          >
            {hours.map((h: string, hourIdx: number) => (
              <div
                key={h}
                style={{ height: slotPx }}
                className={[
                  "flex flex-col items-center justify-start pt-0.5 border-b border-white/[0.22] leading-none transition-colors duration-150 hover:bg-white/[0.05]",
                  view === "day" &&
                  agendaDragSlot != null &&
                  agendaDragSlot === hourIdx
                    ? "bg-[#f3d8b6]/22 shadow-[inset_0_0_20px_rgba(243,216,182,0.12)]"
                    : "",
                ].join(" ")}
              >
                <span className="text-[11px] font-mono font-bold text-white/65 leading-none">
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
                ? dayGridStaff.map((member: any, colIdx: number) => {
                  const mid = toIdStr(member?.id);

                  const columnWidth = shouldScrollX ? colWidth : dayColWidth;

                  const columnKey = mid ?? null;
                  const pairs = dayLinesByStaff.get(columnKey) ?? [];

                  const laid = buildLanes(pairs);
                  return (
                    <div
                      key={mid ?? `virtual-${member?.name ?? "na"}`}
                      className={[
                        "relative border-r border-white/[0.22] transition-[background-color,box-shadow] duration-150 bg-scz-dark",
                        agendaDragCol != null && agendaDragCol === colIdx
                          ? "bg-[#f3d8b6]/[0.13] shadow-[inset_0_0_48px_rgba(243,216,182,0.16)] ring-2 ring-inset ring-[#f3d8b6]/42"
                          : "",
                      ].join(" ")}
                      style={{
                        width: columnWidth,
                        flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                        minWidth: shouldScrollX ? columnWidth : undefined,
                      }}
                    >
                      {hours.map((h: string, hourIdx: number) => {
                        const dragHere =
                          agendaDragSlot != null && agendaDragSlot === hourIdx;
                        return (
                        <div
                          key={h}
                          role="presentation"
                          style={{ height: slotPx }}
                          className={[
                            "relative z-0 border-b border-white/[0.22] transition-colors duration-150 cursor-crosshair",
                            dragHere
                              ? "bg-[#f3d8b6]/18 shadow-[inset_0_1px_0_rgba(243,216,182,0.18)]"
                              : "hover:bg-white/[0.07] active:bg-white/[0.1]",
                          ].join(" ")}
                          onClick={() =>
                            setSelectedSlot({ time: h, staffId: mid })
                          }
                        />
                        );
                      })}

                      {currentTimeLineTopPx != null ? (
                        <div
                          className="absolute left-0 right-0 pointer-events-none z-[8]"
                          style={{ top: currentTimeLineTopPx }}
                          aria-hidden
                        >
                          <div className="relative w-full h-[2px] bg-[#ff6b6b]/30">
                            <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-[#ff6b6b]/70 shadow-[0_0_6px_rgba(255,107,107,0.4)]" />
                          </div>
                        </div>
                      ) : null}

                      <div className="absolute inset-0 z-10 p-1 pointer-events-none">

                        {laid.map(({ app, line, laneIndex, laneCount }: any) => (
                          <div
                            key={String(line.id)}
                            className="pointer-events-auto relative z-20"
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
                                agendaContextDay={currentDate}
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
                                columnsCount={dayGridStaff.length}
                                gridHeightPx={gridHeightPx}
                                columnStaffId={mid}
                                staffOrder={dayStaffOrder}
                                laneIndex={laneIndex}
                                laneCount={laneCount}
                                isHighlighted={highlightAppointmentId != null && String(app?.id) === String(highlightAppointmentId)}
                                onAgendaDragColumnChange={setAgendaDragCol}
                                onAgendaDragSlotChange={setAgendaDragSlot}
                                agendaContextDay={currentDate}
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
                      className="relative border-r border-white/[0.22] bg-scz-dark"
                      style={{
                        width: colWidth,
                        flex: shouldScrollX ? "0 0 auto" : "1 1 0%",
                        minWidth: shouldScrollX ? colWidth : undefined,
                      }}
                    >
                      {hours.map((h: string) => (
                        <div
                          key={h}
                          role="presentation"
                          style={{ height: slotPx }}
                          className="relative z-0 border-b border-white/[0.22] cursor-crosshair transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
                          onClick={() =>
                            setSelectedSlot({ time: h, staffId: null })
                          }
                        />
                      ))}

                      <div className="absolute inset-0 z-10 p-1 pointer-events-none">
                        {dayPairs.map(({ app, line }: any) => (
                          <div
                            key={line.id}
                            className="pointer-events-auto relative z-20"
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
                                agendaContextDay={day.date}
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
                                staffOrder={
                                  weekStaffOrderByDayDate?.get(day.date) ?? staffOrderFull
                                }
                                isHighlighted={highlightAppointmentId != null && String(app?.id) === String(highlightAppointmentId)}
                                agendaContextDay={day.date}
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
          selectedDay={String(editingAppointment.start_time).slice(0, 10)}
          close={() => setEditingAppointment(null)}
          onUpdated={() => loadAppointments(activeSalonId)}
        />
      )}

      <CalendarModal
        isOpen={calendarOpen}
        close={() => setCalendarOpen(false)}
        selectedDate={currentDate}
        onSelectDate={(d) => {
          setCalendarOpen(false);
          navigateAgendaDate(d);
        }}
      />

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
