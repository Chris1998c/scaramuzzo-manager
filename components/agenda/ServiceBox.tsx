"use client";

import { useRouter } from "next/navigation";
import { motion, useMotionValue } from "framer-motion";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { timeFromTs } from "@/lib/appointmentTime";
import { SLOT_MINUTES, SLOT_PX } from "./utils";
import { toast } from "sonner";
/* ======================
   TYPES
====================== */

type Segment = { name: string; color: string; duration: number };

export type ServiceLine = {
  id: string; // ✅ appointment_services.id (UUID/string)
  appointment_id: number;
  service_id: number;
  staff_id: string | null; // UUID/string o null
  start_time: string; // "YYYY-MM-DDTHH:mm:ss"
  duration_minutes: number | null;
  services?: {
    id: number;
    name: string | null;
    color_code: string | null;
    duration: number | null;
  } | null;
};

interface Props {
  appointment: any; // contiene customers + status + notes + id
  line: ServiceLine; // singola riga appointment_services
  hours: string[];
  onClick?: () => void;
  onUpdated?: () => void;

  // --- ORIZZONTALE (Boss-style) ---
  enableHorizontal?: boolean;

  // larghezza colonna reale (quella usata in AgendaGrid)
  colWidth: number;

  // indice colonna corrente (0..columnsCount-1)
  columnIndex: number;

  // numero colonne totali
  columnsCount: number;

  // altezza totale griglia
  gridHeightPx: number;

  // id staff della colonna corrente
  columnStaffId: string | null;

  // ordine colonne (array id string|null nello stesso ordine delle colonne)
  staffOrder: (string | null)[];

  // ✅ STACKING (collision engine)
  laneIndex?: number; // 0..laneCount-1
  laneCount?: number; // >=1

  // Evidenziazione da ?highlight= (link da In Sala → Scheda)
  isHighlighted?: boolean;
}

/* ======================
   HELPERS
====================== */

function statusMeta(status: string | null | undefined) {
  const s = String(status || "scheduled");
  if (s === "in_sala") {
    return {
      label: "IN SALA",
      cls: "bg-emerald-400 text-black border border-emerald-300/80",
    };
  }
  if (s === "done") {
    return {
      label: "COMPLETATO",
      cls: "bg-white/10 text-white/80 border border-white/20",
    };
  }
  if (s === "cancelled") {
    return {
      label: "ANNULLATO",
      cls: "bg-red-500/15 text-red-200 border border-red-400/40",
    };
  }
  return {
    label: "PRENOTATO",
    cls: "bg-black/40 text-[#f3d8b6] border border-white/20",
  };
}

function toIdStr(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

/** Date locale (no UTC shift) */
function parseLocal(ts: string) {
  const [date, time] = String(ts).split("T");
  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm, ss] = String(time || "00:00:00").split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0, 0);
}

/** format “YYYY-MM-DDTHH:mm:ss” senza Z */
function toNoZ(dt: Date) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/* ======================
   COMPONENT
====================== */

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
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement | null>(null);

  const [checkingIn, setCheckingIn] = useState(false);
  const [openActions, setOpenActions] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [saving, setSaving] = useState(false);

  // ✅ Motion values: fluidi e senza rerender ad ogni pixel
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // reset motion offsets quando arrivano dati nuovi
  useEffect(() => {
    x.set(0);
    y.set(0);
  }, [line?.id, line?.start_time, line?.duration_minutes, line?.staff_id, x, y]);

  /* ---------- BASE POSITION (TOP) ---------- */

  const startTime = timeFromTs(line.start_time);
  const startIndex = hours.indexOf(startTime);
  const safeStartIndex = startIndex >= 0 ? startIndex : 0;
  const topBase = safeStartIndex * SLOT_PX;

  /* ---------- DURATION / HEIGHT ---------- */

  const durationMin =
    Number(line.duration_minutes ?? line.services?.duration ?? SLOT_MINUTES) ||
    SLOT_MINUTES;

  const rawHeight = (durationMin / SLOT_MINUTES) * SLOT_PX;
  const MIN_HEIGHT = Math.max(56, SLOT_PX * 1.35);
  const height = Math.max(MIN_HEIGHT, rawHeight);
  const compact = height < 84;

  /* ---------- GRID LIMITS (REAL BARRIERS) ---------- */

  const gridH = Math.max(0, Number(gridHeightPx) || 0);
  const minY = -topBase;
  const maxY = Math.max(minY, gridH - height - topBase);

  // limiti orizzontali reali (colonne)
  const w = Math.max(140, Number(colWidth) || 260);
  const minX = -columnIndex * w;
  const maxX = Math.max(0, columnsCount - 1 - columnIndex) * w;

  /* ---------- STACKING LAYOUT (GOOGLE STYLE) ---------- */

  const laneC = Math.max(1, Number(laneCount) || 1);
  const laneI = clamp(Number(laneIndex) || 0, 0, laneC - 1);

  // padding interni colonna (coerente con "left-1 right-1" di prima)
  const PAD_L = 6;
  const PAD_R = 6;
  const GAP = laneC > 1 ? 6 : 0;

  const usableW = Math.max(60, w - PAD_L - PAD_R);
  const laneW = usableW / laneC;

  const boxLeft = PAD_L + laneI * laneW + (GAP ? GAP / 2 : 0);
  const boxWidth = Math.max(56, laneW - (GAP ? GAP : 0));

  /* ---------- UI DATA ---------- */

  const customerName = appointment?.customers
    ? `${appointment.customers.first_name ?? ""} ${
        appointment.customers.last_name ?? ""
      }`.trim()
    : "Cliente";

  const svcName =
    String(line?.services?.name ?? "Servizio").trim() || "Servizio";
  const svcColor = line?.services?.color_code || "#a8754f";
  const meta = statusMeta(appointment?.status);

  const segments: Segment[] = [
    { name: svcName, color: svcColor, duration: durationMin },
  ];

  const isInSala = String(appointment?.status) === "in_sala";
  const isDone = String(appointment?.status) === "done";
  const isCancelled = String(appointment?.status) === "cancelled";

  const hasStaff =
    toIdStr(line.staff_id) != null || toIdStr((appointment as any)?.staff_id) != null;

  const startLabel = timeFromTs(line.start_time);
  const durationLabel = `${Math.round(durationMin)}m`;

  /* ======================
     DB UPDATE (UNIFICATA)
  ======================= */

  const updateLine = useCallback(
    async (
      patch: Partial<
        Pick<ServiceLine, "start_time" | "staff_id" | "duration_minutes">
      >
    ) => {
      if (saving) return { ok: false as const, error: new Error("busy") };
      setSaving(true);

      const { error } = await supabase
        .from("appointment_services")
        .update(patch)
        .eq("id", String(line.id));

      setSaving(false);

      if (error) return { ok: false as const, error };
      return { ok: true as const, error: null };
    },
    [saving, supabase, line.id]
  );

  /* ======================
     ACTIONS
  ======================= */

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

      const json = await res.json().catch(() => ({}) as any);
      if (!res.ok)
        throw new Error(json?.error || "Errore durante Porta in sala");

      onUpdated?.();
      router.push(`/dashboard/cassa/${appointment.id}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Errore durante Porta in sala");
    } finally {
      setCheckingIn(false);
    }
  }

  const resizeServiceBySlots = useCallback(
    async (slotsChanged: number) => {
      const currentDuration = Number(durationMin) || SLOT_MINUTES;
      const newDuration = currentDuration + slotsChanged * SLOT_MINUTES;
      if (newDuration < SLOT_MINUTES) return;

      const res = await updateLine({ duration_minutes: newDuration });
      if (!res.ok) {
        toast.error("Errore resize: " + (res.error as any)?.message);
        return;
      }

      onUpdated?.();
    },
    [durationMin, updateLine, onUpdated]
  );

  /* ======================
     SNAP LOGIC (Boss-style)
  ======================= */

  function snapY(px: number) {
    const snapped = Math.round(px / SLOT_PX) * SLOT_PX;
    return clamp(snapped, minY, maxY);
  }

  function snapX(px: number) {
    if (!enableHorizontal) return 0;
    const snappedCols = Math.round(px / w);
    const snapped = snappedCols * w;
    return clamp(snapped, minX, maxX);
  }

  function currentColIndex(): number {
    const current = toIdStr(columnStaffId ?? line.staff_id);
    const idx = staffOrder.findIndex((s) => toIdStr(s) === current);
    return idx >= 0 ? idx : columnIndex;
  }

  function staffIdByVisualIndex(idx: number): string | null {
    if (!staffOrder.length) return null;
    const safe = clamp(idx, 0, staffOrder.length - 1);
    return toIdStr(staffOrder[safe]);
  }

  /* ======================
     DRAG END APPLY (PATCH UNICO)
  ======================= */

  const applyDragResult = useCallback(async () => {
    const finalY = Number(y.get()) || 0;
    const finalX = enableHorizontal ? Number(x.get()) || 0 : 0;

    const slotsMoved = Math.round(finalY / SLOT_PX);

    let colsMoved = 0;
    if (enableHorizontal && staffOrder.length) {
      colsMoved = Math.round(finalX / w);
    }

    const needStaffMove =
      enableHorizontal && colsMoved !== 0 && staffOrder.length;
    const needTimeMove = slotsMoved !== 0;

    if (!needStaffMove && !needTimeMove) {
      x.set(0);
      y.set(0);
      return;
    }

    const patch: any = {};

    if (needStaffMove) {
      const from = currentColIndex();
      const to = from + colsMoved;
      patch.staff_id = staffIdByVisualIndex(to);
    }

    if (needTimeMove) {
      const s0 = parseLocal(line.start_time);
      const deltaMin = slotsMoved * SLOT_MINUTES;
      const newStart = new Date(s0.getTime() + deltaMin * 60_000);
      patch.start_time = toNoZ(newStart);
    }

    const res = await updateLine(patch);
    if (!res.ok) {
      x.set(0);
      y.set(0);
      toast.error("Errore spostamento: " + (res.error as any)?.message);

      return;
    }

    onUpdated?.();
  }, [
    enableHorizontal,
    staffOrder.length,
    w,
    currentColIndex,
    staffIdByVisualIndex,
    line.start_time,
    updateLine,
    onUpdated,
    x,
    y,
  ]);

  /* ======================
     RENDER
  ======================= */

  return (
    <motion.div
      ref={boxRef}
      className={[
        "absolute z-30",
        "rounded-2xl cursor-pointer",
        saving ? "pointer-events-none opacity-60" : "",
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
      dragListener={!openActions && !resizing}
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
      }}
      onDrag={(_, info) => {
        const ny = snapY(info.offset.y);
        y.set(ny);

        if (enableHorizontal) {
          const nx = snapX(info.offset.x);
          x.set(nx);
        }
      }}
      onDragEnd={async () => {
        setDragging(false);
        await applyDragResult();
      }}
      onClick={() => {
        if (dragging || resizing || saving) return;
        onClick?.();
      }}
    >
      <div
        className={[
          "relative h-full w-full overflow-visible rounded-2xl",
          "bg-scz-dark/95 backdrop-blur-md",
          "border border-white/10",
          "shadow-[0_16px_55px_rgba(0,0,0,0.55)]",
          isHighlighted
            ? "ring-2 ring-[#f3d8b6] shadow-[0_0_24px_rgba(243,216,182,0.35)]"
            : "",
          !isHighlighted && isInSala
            ? "ring-2 ring-emerald-400/70 shadow-[0_0_32px_rgba(34,197,94,0.25)]"
            : "",
          !isHighlighted && !isInSala ? "ring-1 ring-black/40" : "",
          isDone ? "opacity-75" : "",
          isCancelled ? "opacity-60 grayscale" : "",
          dragging || resizing ? "scale-[1.02] ring-2 ring-white/50" : "",
        ].join(" ")}
      >
        <div className="absolute inset-0 rounded-2xl overflow-hidden">
          <div
            className="absolute left-0 top-0 bottom-0 w-[7px]"
            style={{ backgroundColor: svcColor }}
          />

          <div className="absolute inset-0 left-[7px] opacity-[0.18] pointer-events-none">
            <div className="h-full w-full flex flex-col">
              {segments.map((seg: Segment, i: number) => (
                <div
                  key={`${seg.name}-${i}`}
                  style={{ flex: seg.duration, backgroundColor: seg.color }}
                  className="w-full border-b border-black/20"
                />
              ))}
            </div>
          </div>

          <div
            className={`relative z-10 h-full pl-5 pr-9 ${
              compact ? "py-1.5" : "py-2.5"
            }`}
          >
            <div className="w-full min-w-0 flex flex-col gap-0.5">
              {/* Top row: time + duration + status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-[11px] font-mono font-black text-white/90">
                    {startLabel}
                  </span>
                  {!compact && (
                    <span className="shrink-0 text-[10px] font-mono text-white/60">
                      {durationLabel}
                    </span>
                  )}
                </div>
                <span
                  className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.cls}`}
                >
                  {meta.label}
                </span>
              </div>

              {/* Cliente */}
              <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                <h4
                  className={`font-extrabold text-[#f3d8b6] truncate ${
                    compact ? "text-[12px]" : "text-[13px]"
                  }`}
                >
                  {customerName}
                </h4>
              </div>

              {/* Servizio + staff */}
              <div
                className={`flex items-center justify-between gap-2 min-w-0 ${
                  compact ? "mt-0.5" : "mt-1"
                }`}
              >
                <div
                  className={`text-white/85 truncate ${
                    compact ? "text-[11px]" : "text-[12px]"
                  }`}
                >
                  {svcName}
                </div>
                <div className="shrink-0 flex items-center gap-1 text-[10px] uppercase tracking-wider">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
                      hasStaff
                        ? "border-emerald-400/40 text-emerald-200 bg-emerald-500/10"
                        : "border-white/15 text-white/50 bg-black/40"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span className="font-black">
                      {hasStaff ? "Staff" : "Da assegnare"}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* RESIZE HANDLE */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize z-20 hover:bg-white/5 transition"
            drag="y"
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={{ top: -1000, bottom: 1000 }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setOpenActions(false);
              setResizing(true);
            }}
            onDragEnd={async (_: any, info: any) => {
              setResizing(false);
              const slotsChanged = Math.round(info.offset.y / SLOT_PX);
              if (slotsChanged === 0) return;
              await resizeServiceBySlots(slotsChanged);
            }}
          />
        </div>

        {/* ACTION MENU */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenActions((v) => !v);
          }}
          className="absolute top-2 right-2 z-40 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 border border-white/15 text-white/80 hover:bg-black/80 hover:text-[#f3d8b6] transition-colors"
        >
          ⋮
        </button>

        {openActions && (
          <div
            className="absolute right-2 top-10 z-50 w-48 rounded-2xl bg-scz-dark border border-white/10 shadow-[0_16px_55px_rgba(0,0,0,0.75)] py-1.5 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pb-1 pt-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
              Azioni appuntamento
            </div>
            <button
              onClick={handlePortaInSala}
              disabled={checkingIn}
              className="w-full px-4 py-2.5 text-left text-xs text-white/90 hover:bg-white/5 border-t border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              👤 {checkingIn ? "Porta in sala..." : "Porta in sala"}
            </button>

            <button
              onClick={() => {
                setOpenActions(false);
                router.push(`/dashboard/cassa/${appointment.id}`);
              }}
              className="w-full px-4 py-2.5 text-left text-xs text-white/90 hover:bg-white/5 border-t border-white/5"
            >
              💰 Vai in cassa
            </button>

            <button
              onClick={() => setOpenActions(false)}
              className="w-full px-4 py-2.5 text-left text-xs text-white/60 hover:bg-white/5 border-t border-white/5"
            >
              📋 Scheda tecnica
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
