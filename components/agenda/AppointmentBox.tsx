"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { timeFromTs } from "@/lib/appointmentTime";
import { SLOT_MINUTES, SLOT_PX } from "./utils";

type Segment = { name: string; color: string; duration: number };

interface Props {
  appointment: any;
  hours: string[];
  onClick: () => void;
  onUpdated?: () => void; // refresh grid
  onCashIn?: () => void; // apre direttamente Cash-in
}

/* --- HELPERS INTERNI --- */

function statusMeta(status: string | null | undefined) {
  const s = String(status || "scheduled");
  if (s === "in_sala")
    return { label: "IN SALA", cls: "bg-[#f3d8b6] text-[#1A0F0A]" };
  if (s === "done")
    return {
      label: "DONE",
      cls: "bg-white/10 text-white/70 border border-white/10",
    };
  if (s === "cancelled")
    return {
      label: "ANNULL.",
      cls: "bg-red-500/15 text-red-200 border border-red-400/20",
    };
  return {
    label: "PRENOT.",
    cls: "bg-black/25 text-[#f3d8b6] border border-[#5c3a21]/60",
  };
}

/** Date locale (no UTC shift) */
function parseLocal(ts: string) {
  const [date, time] = String(ts).split("T");
  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm, ss] = String(time || "00:00:00")
    .split(":")
    .map(Number);
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

/**
 * Legge i segmenti da appointment_services (schema: 1 appointment + N righe).
 * Richiede join: appointment_services( ..., services:service_id(...) )
 */
function getServiceSegments(appointment: any): Segment[] {
  const lines = Array.isArray(appointment?.appointment_services)
    ? appointment.appointment_services
    : [];

  return lines
    .slice()
    .sort((a: any, b: any) =>
      String(a?.start_time ?? "").localeCompare(String(b?.start_time ?? "")),
    )
    .map((line: any): Segment => {
      const svc = line?.services;

      const name = String(svc?.name ?? "").trim() || "Servizio";
      const color = (svc?.color_code as string) || "#a8754f";

      const duration =
        Number(line?.duration_minutes ?? svc?.duration ?? SLOT_MINUTES) ||
        SLOT_MINUTES;

      return { name, color, duration };
    });
}

function uniqueColors(segments: Segment[]) {
  return Array.from(new Set(segments.map((seg: Segment) => seg.color))).slice(
    0,
    6,
  );
}

/* --- COMPONENTE PRINCIPALE --- */

export default function AppointmentBox({
  appointment,
  hours,
  onClick,
  onUpdated,
  onCashIn,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const [checkingIn, setCheckingIn] = useState(false);
  const [openActions, setOpenActions] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [saving, setSaving] = useState(false);

  // ===== POSIZIONE =====
  const startTime = timeFromTs(appointment.start_time);
  const startIndex = hours.indexOf(startTime);
  const safeStartIndex = startIndex >= 0 ? startIndex : 0;
  const top = safeStartIndex * SLOT_PX;

  // ===== DURATA (min) =====
  const start = parseLocal(appointment.start_time);
  const end = appointment.end_time ? parseLocal(appointment.end_time) : null;

  const durationMin =
    end && end.getTime() > start.getTime()
      ? (end.getTime() - start.getTime()) / 60000
      : SLOT_MINUTES;

  // ===== DIMENSIONI BOX =====
  const rawHeight = (durationMin / SLOT_MINUTES) * SLOT_PX;
  const MIN_HEIGHT = Math.max(56, SLOT_PX * 1.35);
  const height = Math.max(MIN_HEIGHT, rawHeight);
  const compact = height < 84;

  // ===== DATI UI =====
  const customerName = appointment?.customers
    ? `${appointment.customers.first_name ?? ""} ${
        appointment.customers.last_name ?? ""
      }`.trim()
    : "Cliente";

  const segments: Segment[] = getServiceSegments(appointment);
  const serviceNames = segments.map((seg: Segment) => seg.name);
  const firstTwo = serviceNames.slice(0, 2);
  const extraCount = Math.max(0, serviceNames.length - 2);

  const colors = uniqueColors(segments);
  const accent = colors[0] || "#a8754f";
  const meta = statusMeta(appointment.status);

  const sumSeg = segments.reduce(
    (sum: number, seg: Segment) => sum + (Number(seg.duration) || 0),
    0,
  );
  const denom =
    sumSeg > 0 ? sumSeg : Math.max(SLOT_MINUTES, Math.round(durationMin));
  const normalizedSegments: Segment[] = segments.length
    ? segments
    : [{ name: "Servizio", color: accent, duration: denom }];

  // PORTA IN SALA / CASSA
  // PORTA IN SALA (usa SEMPRE la route API, non RPC)
  async function handlePortaInSala() {
    if (!appointment?.id) return;

    // se già in_sala o done: idempotenza lato UI (comunque la route è idempotente)
    const s = String(appointment.status || "");
    if (s === "in_sala" || s === "done") {
      setOpenActions(false);
      return;
    }

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

      // refresh griglia
      onUpdated?.();

      // NOTA: qui NON faccio push in cassa (hai già “Vai in cassa” nel menu)
      // se invece vuoi “Porta in sala” = “porta e apri cassa”, dimmelo e lo mettiamo.
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Errore durante Porta in sala");
      
    } finally {
      setCheckingIn(false);
    }
  }

  // DRAG LOGIC
  async function shiftAppointmentBySlots(slotsMoved: number) {
    if (saving) return;
    setSaving(true);

    const s0 = parseLocal(appointment.start_time);
    const e0 = appointment.end_time ? parseLocal(appointment.end_time) : null;
    const deltaMin = slotsMoved * SLOT_MINUTES;

    const newStart = new Date(s0.getTime() + deltaMin * 60_000);
    const newEnd = e0 ? new Date(e0.getTime() + deltaMin * 60_000) : null;

    const { error } = await supabase
      .from("appointments")
      .update({
        start_time: toNoZ(newStart),
        ...(newEnd ? { end_time: toNoZ(newEnd) } : {}),
      })
      .eq("id", appointment.id);

    setSaving(false);
    if (error) {
      alert("Errore spostamento: " + error.message);
      return;
    }
    onUpdated?.();
  }

  // RESIZE LOGIC
  async function resizeAppointmentBySlots(slotsChanged: number) {
    if (saving) return;
    setSaving(true);

    const s0 = parseLocal(appointment.start_time);
    const e0 = appointment.end_time
      ? parseLocal(appointment.end_time)
      : new Date(s0.getTime() + SLOT_MINUTES * 60_000);

    const currentDuration = (e0.getTime() - s0.getTime()) / 60000;
    const newDuration = currentDuration + slotsChanged * SLOT_MINUTES;

    if (newDuration < SLOT_MINUTES) {
      setSaving(false);
      return;
    }

    const newEnd = new Date(s0.getTime() + newDuration * 60_000);
    const { error } = await supabase
      .from("appointments")
      .update({ end_time: toNoZ(newEnd) })
      .eq("id", appointment.id);

    setSaving(false);
    if (error) {
      alert("Errore resize: " + error.message);
      return;
    }
    onUpdated?.();
  }

  const isInSala = String(appointment.status) === "in_sala";
  const isDone = String(appointment.status) === "done";

  return (
    <motion.div
      ref={boxRef}
      className={[
        "absolute left-1 right-1 z-30",
        "rounded-2xl cursor-pointer",
        "transition-all duration-200",
        saving ? "pointer-events-none opacity-50" : "",
      ].join(" ")}
      style={{ top, height, opacity: dragging ? 0.82 : 1 }}
      drag="y"
      dragListener={!openActions && !resizing}
      dragConstraints={{ top: -5000, bottom: 5000 }}
      dragElastic={0.02}
      dragMomentum={false}
      onDragStart={() => !saving && setDragging(true)}
      onDragEnd={async (_: any, info: any) => {
        setDragging(false);
        const slotsMoved = Math.round(info.offset.y / SLOT_PX);
        if (slotsMoved === 0) return;
        await shiftAppointmentBySlots(slotsMoved);
      }}
      onClick={() => !dragging && !resizing && !saving && onClick()}
    >
      {/* WRAPPER: overflow visible così il menu ⋮ NON viene tagliato */}
      <div
        className={[
          "relative h-full w-full overflow-visible rounded-2xl",
          "bg-[#1c0f0a]/92 backdrop-blur-md",
          "border border-[#f3d8b6]/22",
          "shadow-[0_16px_55px_rgba(0,0,0,0.55)]",
          isInSala
            ? "ring-2 ring-[#f3d8b6]/35 shadow-[0_0_70px_rgba(243,216,182,0.16)]"
            : "ring-1 ring-black/20",
          isDone ? "opacity-70" : "",
        ].join(" ")}
      >
        {/* Layer interno: clip SOLO contenuto, non il menu */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden">
          {/* Accent Lateral Bar */}
          <div
            className="absolute left-0 top-0 bottom-0 w-[7px]"
            style={{ backgroundColor: accent }}
          />

          {/* Background Segments */}
          <div className="absolute inset-0 left-[7px] opacity-[0.15] pointer-events-none">
            <div className="h-full w-full flex flex-col">
              {normalizedSegments.map((seg: Segment, i: number) => (
                <div
                  key={`${seg.name}-${i}`}
                  style={{ flex: seg.duration, backgroundColor: seg.color }}
                  className="w-full border-b border-black/10"
                />
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div
            className={`relative z-10 h-full pl-5 pr-8 ${
              compact ? "py-1 flex items-center" : "py-3"
            }`}
          >
            <div className="w-full min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded ${meta.cls}`}
                >
                  {meta.label}
                </span>
                <h4
                  className={`font-extrabold text-[#f3d8b6] truncate ${
                    compact ? "text-[12px]" : "text-[13px]"
                  }`}
                >
                  {customerName}
                </h4>
              </div>

              {/* SERVIZI: SEMPRE sotto al nome */}
              <div
                className={`text-white/80 truncate ${
                  compact ? "text-[11px]" : "text-[12px]"
                }`}
              >
                {firstTwo.join(" • ")}
                {extraCount > 0 && (
                  <span className="text-white/40 ml-1">+{extraCount}</span>
                )}
                <span className="ml-2 text-white/40 font-mono italic">
                  {Math.round(durationMin)}m
                </span>
              </div>

              {!compact && appointment?.notes && (
                <p className="mt-2 text-[10px] text-white/50 line-clamp-1 italic border-l border-white/10 pl-2">
                  {appointment.notes}
                </p>
              )}
            </div>
          </div>

          {/* Resize Handle (Bottom) */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize z-20 hover:bg-white/5 transition"
            onMouseDown={(e) => {
              e.stopPropagation();
              setResizing(true);
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 500 }}
            dragElastic={0}
            dragMomentum={false}
            onDragEnd={async (_: any, info: any) => {
              setResizing(false);
              const slotsChanged = Math.round(info.offset.y / SLOT_PX);
              if (slotsChanged === 0) return;
              await resizeAppointmentBySlots(slotsChanged);
            }}
          />
        </div>

        {/* Action Menu Trigger (fuori dal layer overflow-hidden) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenActions(!openActions);
          }}
          className="absolute top-2 right-2 z-40 w-7 h-7 flex items-center justify-center rounded-full bg-black/40 border border-white/10 text-[#f3d8b6] hover:bg-black/60 transition"
        >
          ⋮
        </button>

        {openActions && (
          <div
            className="absolute right-2 top-10 z-50 w-44 rounded-xl bg-[#140b07] border border-[#5c3a21]/60 shadow-2xl py-1 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handlePortaInSala}
              disabled={checkingIn || isInSala || isDone}
              className="w-full px-4 py-2.5 text-left text-xs text-white hover:bg-white/5 border-b border-white/5 disabled:opacity-50"
            >
              {isDone
                ? "✅ Già chiuso"
                : isInSala
                  ? "👤 Già in sala"
                  : checkingIn
                    ? "..."
                    : "👤 Porta in sala"}
            </button>
            <button
              onClick={async () => {
                setOpenActions(false);

                // Se non è in_sala e non è done, prima porta in sala
                if (!isInSala && !isDone) {
                  try {
                    setCheckingIn(true);

                    const res = await fetch("/api/agenda/porta-in-sala", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        appointment_id: Number(appointment.id),
                      }),
                    });

                    const json = await res.json().catch(() => ({}) as any);
                    if (!res.ok)
                      throw new Error(
                        json?.error || "Errore durante Porta in sala",
                      );

                    onUpdated?.();
                  } catch (e: any) {
                    alert(e?.message || "Errore durante Porta in sala");
                    setCheckingIn(false);
                    return;
                  } finally {
                    setCheckingIn(false);
                  }
                }

                router.push(`/dashboard/cassa/${appointment.id}`);
              }}
              disabled={checkingIn}
              className="w-full px-4 py-2.5 text-left text-xs text-white hover:bg-white/5 border-b border-white/5 disabled:opacity-50"
            >
              💰 {checkingIn ? "..." : "Vai in cassa"}
            </button>

            <button
              onClick={() => setOpenActions(false)}
              className="w-full px-4 py-2.5 text-left text-xs text-white/50 hover:bg-white/5"
            >
              🧪 Scheda Tecnica
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
