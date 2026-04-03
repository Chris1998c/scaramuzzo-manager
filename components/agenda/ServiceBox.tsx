"use client";

import { useRouter } from "next/navigation";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { SLOT_MINUTES, timeFromTs } from "./utils";
import { useAgendaSlotPx } from "./AgendaSlotPxContext";
import { toast } from "sonner";
import {
  clampDurationMinutes,
  commitLinePatch,
  type AgendaServiceLine,
  parseLocal,
  toNoZ,
  normalizeStaffId,
} from "@/lib/agenda/agendaContract";
import type { AgendaAppointment } from "@/lib/agenda/agendaContract";

/** Altezza minima card: ~1.35 slot o 56px — leggibilità senza blocchi enormi. */
const CARD_MIN_HEIGHT_SLOTS = 1.35;
const CARD_COMPACT_BREAK_PX = 84;

function accentToTintCss(hex: string): { soft: string; edge: string } {
  const h = String(hex || "")
    .replace("#", "")
    .trim()
    .slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    return { soft: "rgba(168,117,79,0.12)", edge: "rgba(168,117,79,0.45)" };
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return {
    soft: `rgba(${r},${g},${b},0.11)`,
    edge: `rgba(${r},${g},${b},0.42)`,
  };
}

function statusMeta(status: string | null | undefined) {
  const s = String(status || "scheduled");
  if (s === "in_sala") {
    return {
      label: "In sala",
      cls: "bg-emerald-400/90 text-black",
    };
  }
  if (s === "done") {
    return {
      label: "Completato",
      cls: "bg-white/10 text-white/70",
    };
  }
  if (s === "cancelled") {
    return {
      label: "Annullato",
      cls: "bg-red-500/20 text-red-200",
    };
  }
  return {
    label: "Prenotato",
    cls: "bg-white/5 text-white/75",
  };
}

function toIdStr(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

interface Props {
  appointment: AgendaAppointment;
  line: AgendaServiceLine;
  hours: string[];
  onClick?: () => void;
  onUpdated?: () => void;
  enableHorizontal?: boolean;
  colWidth: number;
  columnIndex: number;
  columnsCount: number;
  gridHeightPx: number;
  columnStaffId: string | null;
  staffOrder: (string | null)[];
  laneIndex?: number;
  laneCount?: number;
  isHighlighted?: boolean;
  onAgendaDragColumnChange?: (columnIndex: number | null) => void;
  onAgendaDragSlotChange?: (hourRowIndex: number | null) => void;
  agendaContextDay?: string | null;
}

export default function ServiceBox({
  appointment,
  line,
  hours,
  onClick,
  onUpdated,
  enableHorizontal = false,
  colWidth,
  columnIndex,
  columnsCount,
  gridHeightPx,
  columnStaffId,
  staffOrder,
  laneIndex = 0,
  laneCount = 1,
  isHighlighted = false,
  onAgendaDragColumnChange,
  onAgendaDragSlotChange,
  agendaContextDay: _agendaContextDay = null,
}: Props) {
  const slotPx = useAgendaSlotPx();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const cardSurfaceRef = useRef<HTMLDivElement | null>(null);
  const lastDragColRef = useRef<number | null>(null);
  const lastDragSlotRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const [checkingIn, setCheckingIn] = useState(false);
  const [openActions, setOpenActions] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [saving, setSaving] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    x.set(0);
    y.set(0);
  }, [line.id, line.start_time, line.duration_minutes, line.staff_id, x, y]);

  const startTime = timeFromTs(line.start_time);
  const startIndex = hours.indexOf(startTime);
  const safeStartIndex = startIndex >= 0 ? startIndex : 0;
  const topBase = safeStartIndex * slotPx;

  const durationMin = clampDurationMinutes(line.duration_minutes ?? line.services?.duration);

  const rawHeight = (durationMin / SLOT_MINUTES) * slotPx;
  const MIN_HEIGHT = Math.max(56, slotPx * CARD_MIN_HEIGHT_SLOTS);
  const height = Math.max(MIN_HEIGHT, rawHeight);
  const compact = height < CARD_COMPACT_BREAK_PX;

  const gridH = Math.max(0, Number(gridHeightPx) || 0);
  const minY = -topBase;
  const maxY = Math.max(minY, gridH - height - topBase);

  const w = Math.max(140, Number(colWidth) || 260);
  const minX = -columnIndex * w;
  const maxX = Math.max(0, columnsCount - 1 - columnIndex) * w;

  const dragLimitsRef = useRef({
    minY: 0,
    maxY: 0,
    minX: 0,
    maxX: 0,
    w: 260,
    slotPx: 26,
    enableHorizontal: false,
  });
  dragLimitsRef.current = { minY, maxY, minX, maxX, w, slotPx, enableHorizontal };

  const ghostOffsetX = useTransform(x, (latest) => {
    const L = dragLimitsRef.current;
    if (!L.enableHorizontal) return 0;
    const cx = clamp(latest, L.minX, L.maxX);
    const sx = clamp(Math.round(cx / L.w) * L.w, L.minX, L.maxX);
    return sx - latest;
  });
  const ghostOffsetY = useTransform(y, (latest) => {
    const L = dragLimitsRef.current;
    const cy = clamp(latest, L.minY, L.maxY);
    const sy = clamp(Math.round(cy / L.slotPx) * L.slotPx, L.minY, L.maxY);
    return sy - latest;
  });

  const laneC = Math.max(1, Number(laneCount) || 1);
  const laneI = clamp(Number(laneIndex) || 0, 0, laneC - 1);
  const PAD_L = 6;
  const PAD_R = 6;
  const GAP = laneC > 1 ? 6 : 0;
  const usableW = Math.max(60, w - PAD_L - PAD_R);
  const laneW = usableW / laneC;
  const boxLeft = PAD_L + laneI * laneW + (GAP ? GAP / 2 : 0);
  const boxWidth = Math.max(56, laneW - (GAP ? GAP : 0));

  const customerName =
    `${appointment.customers.first_name} ${appointment.customers.last_name}`.trim() || "Cliente";

  const svcName = String(line.services?.name ?? "Servizio").trim() || "Servizio";
  const accentColor = String(line.services?.color_code || "").trim() || "#a8754f";
  const accentTint = useMemo(() => accentToTintCss(accentColor), [accentColor]);
  const meta = statusMeta(appointment.status);

  const totalServicesOnAppointment = appointment.appointment_services.length;
  const extraSvcCount = Math.max(0, totalServicesOnAppointment - 1);

  const isInSala = appointment.status === "in_sala";
  const isDone = appointment.status === "done";
  const isCancelled = appointment.status === "cancelled";

  const hasStaff = line.staff_id != null;

  const startLabel = timeFromTs(line.start_time);
  const durationLabel = `${Math.round(durationMin)} min`;

  const extraServicesTooltip = useMemo(() => {
    if (extraSvcCount <= 0) return "";
    const rows = [...appointment.appointment_services]
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
      .slice(1)
      .map((r, i) => {
        const n = String(r.services?.name ?? "Servizio").trim() || "Servizio";
        const dm = clampDurationMinutes(r.duration_minutes ?? r.services?.duration);
        return `${i + 2}. ${n} (${Math.round(dm)} min)`;
      });
    return ["Altri servizi:", ...rows].join("\n");
  }, [appointment.appointment_services, extraSvcCount]);

  function pulseDragSnap() {
    const el = cardSurfaceRef.current;
    if (!el || typeof el.animate !== "function") return;
    el.animate(
      [
        { transform: "scale(1.02)" },
        { transform: "scale(1.045)" },
        { transform: "scale(1.02)" },
      ],
      { duration: 240, easing: "cubic-bezier(0.33, 1.18, 0.64, 1)" }
    );
  }

  const lineDurationMinutes = useMemo(() => durationMin, [durationMin]);

  async function handlePortaInSala() {
    if (!appointment?.id) return;
    setOpenActions(false);
    setCheckingIn(true);
    try {
      const res = await fetch("/api/agenda/porta-in-sala", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: Number(appointment.id) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string })?.error || "Errore durante Porta in sala");
      onUpdated?.();
      router.push(`/dashboard/cassa/${appointment.id}`);
    } catch (e: unknown) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Errore durante Porta in sala");
    } finally {
      setCheckingIn(false);
    }
  }

  const resizeServiceBySlots = useCallback(
    async (slotsChanged: number) => {
      const newDurationMinutes = lineDurationMinutes + slotsChanged * SLOT_MINUTES;
      if (newDurationMinutes < SLOT_MINUTES) return;
      setSaving(true);
      const res = await commitLinePatch(supabase, {
        appointmentId: appointment.id,
        lineId: line.id,
        patch: { duration_minutes: newDurationMinutes },
      });
      setSaving(false);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      onUpdated?.();
    },
    [supabase, appointment.id, line.id, lineDurationMinutes, onUpdated]
  );

  function currentColIndex(): number {
    const current = toIdStr(columnStaffId ?? line.staff_id);
    const idx = staffOrder.findIndex((s) => toIdStr(s) === current);
    return idx >= 0 ? idx : columnIndex;
  }

  function staffIdByVisualIndex(idx: number): number | null {
    if (!staffOrder.length) return null;
    const safe = clamp(idx, 0, staffOrder.length - 1);
    return normalizeStaffId(staffOrder[safe]);
  }

  const applyDragResult = useCallback(async () => {
    const finalY = Number(y.get()) || 0;
    const finalX = enableHorizontal ? Number(x.get()) || 0 : 0;
    const slotsMoved = Math.round(finalY / slotPx);
    let colsMoved = 0;
    if (enableHorizontal && staffOrder.length) {
      colsMoved = Math.round(finalX / w);
    }
    const needStaffMove = enableHorizontal && colsMoved !== 0 && staffOrder.length > 0;
    const needTimeMove = slotsMoved !== 0;

    if (!needStaffMove && !needTimeMove) {
      x.set(0);
      y.set(0);
      return;
    }

    const patch: { start_time?: string; staff_id?: number | null } = {};
    if (needStaffMove) {
      const from = currentColIndex();
      const to = from + colsMoved;
      patch.staff_id = staffIdByVisualIndex(to);
    }
    if (needTimeMove) {
      const s0 = parseLocal(line.start_time);
      const deltaMin = slotsMoved * SLOT_MINUTES;
      patch.start_time = toNoZ(new Date(s0.getTime() + deltaMin * 60_000));
    }

    setSaving(true);
    const res = await commitLinePatch(supabase, {
      appointmentId: appointment.id,
      lineId: line.id,
      patch,
    });
    setSaving(false);

    if (!res.ok) {
      x.set(0);
      y.set(0);
      toast.error(res.error.message);
      return;
    }

    x.set(0);
    y.set(0);
    onUpdated?.();
  }, [
    enableHorizontal,
    staffOrder,
    columnIndex,
    columnStaffId,
    w,
    slotPx,
    line.start_time,
    line.id,
    line.staff_id,
    appointment.id,
    supabase,
    onUpdated,
    x,
    y,
  ]);

  return (
    <motion.div
      className={[
        "absolute rounded-xl select-none touch-none",
        saving
          ? "pointer-events-none opacity-60 cursor-wait z-20"
          : dragging
            ? "cursor-grabbing z-[85]"
            : "cursor-grab z-20",
      ].join(" ")}
      style={{
        top: topBase,
        height,
        left: boxLeft,
        width: boxWidth,
        x,
        y,
      }}
      drag={enableHorizontal ? true : "y"}
      dragListener={!openActions && !resizing && !saving}
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={{
        top: minY,
        bottom: maxY,
        left: enableHorizontal ? minX : 0,
        right: enableHorizontal ? maxX : 0,
      }}
      onDragStart={() => {
        if (saving) return;
        setOpenActions(false);
        setDragging(true);
        lastDragColRef.current = null;
        lastDragSlotRef.current = null;
        if (onAgendaDragColumnChange && enableHorizontal) {
          lastDragColRef.current = columnIndex;
          onAgendaDragColumnChange(columnIndex);
        }
        if (onAgendaDragSlotChange) {
          lastDragSlotRef.current = safeStartIndex;
          onAgendaDragSlotChange(safeStartIndex);
        }
      }}
      onDrag={(_, info) => {
        const oy = info.offset.y;
        const cy = clamp(oy, minY, maxY);
        y.set(cy);
        if (enableHorizontal) {
          const ox = info.offset.x;
          const cx = clamp(ox, minX, maxX);
          x.set(cx);
          if (onAgendaDragColumnChange) {
            const tc = clamp(columnIndex + Math.round(cx / w), 0, columnsCount - 1);
            if (lastDragColRef.current !== tc) {
              lastDragColRef.current = tc;
              onAgendaDragColumnChange(tc);
              pulseDragSnap();
            }
          }
        } else {
          x.set(0);
        }
        if (onAgendaDragSlotChange) {
          const ts = clamp(
            safeStartIndex + Math.round(cy / slotPx),
            0,
            Math.max(0, hours.length - 1)
          );
          if (lastDragSlotRef.current !== ts) {
            lastDragSlotRef.current = ts;
            onAgendaDragSlotChange(ts);
            pulseDragSnap();
          }
        }
      }}
      onDragEnd={async () => {
        onAgendaDragColumnChange?.(null);
        onAgendaDragSlotChange?.(null);
        lastDragColRef.current = null;
        lastDragSlotRef.current = null;

        const rawY = Number(y.get()) || 0;
        const rawX = enableHorizontal ? Number(x.get()) || 0 : 0;
        if (Math.abs(rawY) > 8 || (enableHorizontal && Math.abs(rawX) > 8)) {
          suppressClickRef.current = true;
        }
        const sy = clamp(
          Math.round(clamp(rawY, minY, maxY) / slotPx) * slotPx,
          minY,
          maxY
        );
        const sx = enableHorizontal
          ? clamp(Math.round(clamp(rawX, minX, maxX) / w) * w, minX, maxX)
          : 0;
        y.set(sy);
        x.set(sx);
        setDragging(false);
        await applyDragResult();
      }}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (dragging || resizing || saving) return;
        onClick?.();
      }}
    >
      {dragging && !saving && (
        <motion.div
          aria-hidden
          className="absolute inset-0 z-[1] rounded-xl pointer-events-none border border-dashed border-white/25"
          style={{ x: ghostOffsetX, y: ghostOffsetY }}
        />
      )}
      <div
        ref={cardSurfaceRef}
        className={[
          "relative z-[2] h-full w-full overflow-visible rounded-xl transition-[opacity,box-shadow] duration-200",
          "bg-[#14100e] border border-white/[0.08] shadow-sm",
          dragging && !saving ? "ring-1 ring-white/25" : "",
          isHighlighted ? "ring-2 ring-[#f3d8b6]" : "ring-1 ring-white/10",
          isInSala && !isHighlighted ? "ring-1 ring-emerald-500/40" : "",
          isDone ? "opacity-75" : "",
          isCancelled ? "opacity-55 grayscale" : "",
          resizing ? "ring-1 ring-white/30" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div
          className="absolute inset-0 rounded-xl overflow-hidden flex relative"
          style={{
            background: `linear-gradient(105deg, ${accentTint.soft} 0%, #14100e 42%, #14100e 100%)`,
            boxShadow: `inset 0 0 0 1px ${accentTint.edge}`,
          }}
        >
          <div
            className="w-[3px] flex-shrink-0 self-stretch"
            style={{ backgroundColor: accentColor }}
            aria-hidden
          />
          <div className={`relative z-10 flex-1 min-w-0 pl-2 pr-6 ${compact ? "py-1.5" : "py-1.5"}`}>
            <div className="w-full min-w-0 flex flex-col gap-0.5 justify-start">
              <h4
                title={customerName}
                className={`font-semibold text-[#f3d8b6] leading-snug line-clamp-2 break-words tracking-tight ${
                  compact ? "text-[12px]" : "text-[14px]"
                }`}
              >
                {customerName}
              </h4>
              <div className={`text-white/[0.88] min-w-0 leading-snug ${compact ? "text-[11px]" : "text-xs"}`}>
                <span className="font-medium line-clamp-2 break-words" title={svcName}>
                  {svcName}
                </span>
                {extraSvcCount > 0 ? (
                  <span
                    className="ml-0.5 font-mono text-[10px] font-semibold tabular-nums text-white/55"
                    title={extraServicesTooltip || undefined}
                  >
                    {`+${extraSvcCount}`}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-nowrap items-center gap-1.5 min-w-0">
                <span className="min-w-0 truncate text-[11px] font-mono tabular-nums text-white/[0.62]">
                  {startLabel}
                  <span className="opacity-35"> · </span>
                  {durationLabel}
                </span>
                <span className={`shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded-sm ${meta.cls}`}>
                  {meta.label}
                </span>
                {!hasStaff ? (
                  <span className="text-[9px] text-white/40 truncate">Non assegnato</span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Resize: div + pointer capture (no motion drag annidato sul parent drag x/y) */}
          <div
            role="slider"
            aria-label="Ridimensiona durata"
            tabIndex={0}
            className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize z-20 hover:bg-white/[0.06] touch-none"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpenActions(false);
              setResizing(true);
              const startY = e.clientY;
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              const onUp = (ev: PointerEvent) => {
                el.releasePointerCapture(ev.pointerId);
                el.removeEventListener("pointermove", onMove);
                el.removeEventListener("pointerup", onUp);
                el.removeEventListener("pointercancel", onUp);
                setResizing(false);
                const dy = ev.clientY - startY;
                const slotsChanged = Math.round(dy / slotPx);
                if (slotsChanged !== 0) void resizeServiceBySlots(slotsChanged);
              };
              const onMove = (ev: PointerEvent) => {
                ev.preventDefault();
              };
              el.addEventListener("pointermove", onMove);
              el.addEventListener("pointerup", onUp);
              el.addEventListener("pointercancel", onUp);
            }}
          />
        </div>

        <button
          type="button"
          aria-label="Azioni appuntamento"
          onClick={(e) => {
            e.stopPropagation();
            setOpenActions((v) => !v);
          }}
          className="absolute top-1 right-1 z-40 h-6 w-6 flex items-center justify-center rounded-md bg-black/50 border border-white/10 text-white/75 hover:text-[#f3d8b6] transition-colors text-sm leading-none"
        >
          ⋮
        </button>

        {openActions && (
          <div
            className="absolute right-1 top-8 z-50 w-44 rounded-lg bg-[#1c1210] border border-white/12 shadow-xl py-0.5 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handlePortaInSala}
              disabled={checkingIn}
              className="w-full px-2.5 py-2 text-left text-[11px] font-semibold text-white/90 hover:bg-white/[0.06] border-t border-white/[0.06] disabled:opacity-50"
            >
              {checkingIn ? "Porta in sala…" : "Porta in sala"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenActions(false);
                router.push(`/dashboard/cassa/${appointment.id}`);
              }}
              className="w-full px-2.5 py-2 text-left text-[11px] font-semibold text-white/90 hover:bg-white/[0.06] border-t border-white/[0.06]"
            >
              Vai in cassa
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenActions(false);
                const cid = appointment.customer_id;
                if (cid == null || cid === "") {
                  toast.error("Nessun cliente collegato.");
                  return;
                }
                router.push(`/dashboard/clienti/${cid}`);
              }}
              className="w-full px-2.5 py-2 text-left text-[11px] font-semibold text-white/90 hover:bg-white/[0.06] border-t border-white/[0.06]"
            >
              Scheda cliente
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}