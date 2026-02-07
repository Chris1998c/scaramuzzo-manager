"use client";

import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { timeFromTs } from "@/lib/appointmentTime";
import { SLOT_MINUTES, SLOT_PX } from "./utils";

interface Props {
  appointment: any;
  hours: string[];
  onClick: () => void;
  onUpdated?: () => void; // refresh grid
}

function statusMeta(status: string | null | undefined) {
  const s = String(status || "scheduled");
  if (s === "in_sala") return { label: "IN SALA", cls: "bg-[#f3d8b6] text-[#1A0F0A]" };
  if (s === "done") return { label: "DONE", cls: "bg-white/10 text-white/70 border border-white/10" };
  if (s === "cancelled") return { label: "ANNULL.", cls: "bg-red-500/15 text-red-200 border border-red-400/20" };
  return { label: "PRENOT.", cls: "bg-black/25 text-[#f3d8b6] border border-[#5c3a21]/60" };
}

/** ✅ Date locale (no UTC shift) */
function parseLocal(ts: string) {
  // ts tipo "YYYY-MM-DDTHH:mm:ss" (naive)
  const [date, time] = String(ts).split("T");
  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm, ss] = String(time || "00:00:00").split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0, 0);
}

/** ✅ format “YYYY-MM-DDTHH:mm:ss” senza Z */
function toNoZ(dt: Date) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

function getServiceSegments(appointment: any) {
  const rows = (appointment?.appointment_services || []) as any[];

  // segmenti basati su duration_minutes (ordine come arriva dal select)
  const segs = rows
    .map((r) => {
      const name = r?.service?.name ? String(r.service.name) : null;
      const color = r?.service?.color_code ? String(r.service.color_code) : null;
      const durRaw = Number(r?.duration_minutes ?? 0);
      const dur = Math.max(SLOT_MINUTES, Number.isFinite(durRaw) && durRaw > 0 ? durRaw : SLOT_MINUTES);
      if (!name) return null;
      return { name, color: color || "#a8754f", duration: dur };
    })
    .filter(Boolean) as Array<{ name: string; color: string; duration: number }>;

  return segs;
}

function uniqueColors(segments: Array<{ color: string }>) {
  return Array.from(new Set(segments.map((s) => s.color))).slice(0, 6);
}

export default function AppointmentBox({ appointment, hours, onClick, onUpdated }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const [openActions, setOpenActions] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [saving, setSaving] = useState(false);

  // ===== POSIZIONE =====
  const startTime = timeFromTs(appointment.start_time); // "HH:MM"
  const startIndex = hours.indexOf(startTime);

  // fallback: se non trova esatto (rare), prova arrotondamento al passo
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

  // ✅ MIN HEIGHT: anche 15 minuti devono vedersi bene
  const MIN_HEIGHT = Math.max(56, SLOT_PX * 1.35); // ~56px
  const height = Math.max(MIN_HEIGHT, rawHeight);

  const compact = height < 84; // sotto ~84px

  // ===== DATI UI =====
  const customerName = appointment?.customers
    ? `${appointment.customers.first_name ?? ""} ${appointment.customers.last_name ?? ""}`.trim()
    : "Cliente";

  const segments = getServiceSegments(appointment);

  const serviceNames = segments.map((s) => s.name);
  const firstTwo = serviceNames.slice(0, 2);
  const extraCount = Math.max(0, serviceNames.length - 2);

  const colors = uniqueColors(segments);
  const accent = colors[0] || "#a8754f";

  const meta = statusMeta(appointment.status);

  // ===== SEGMENTI MULTI-SERVIZIO =====
  const sumSeg = segments.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
  const denom = sumSeg > 0 ? sumSeg : Math.max(SLOT_MINUTES, Math.round(durationMin));

  const normalizedSegments =
    segments.length
      ? segments
      : [{ name: "Servizio", color: accent, duration: denom }];

  // ===== PORTA IN SALA =====
  async function onPortaInSala() {
    if (saving) return;
    setSaving(true);

    const { error } = await supabase
      .from("appointments")
      .update({ status: "in_sala" })
      .eq("id", appointment.id);

    setSaving(false);
    setOpenActions(false);

    if (error) {
      alert("Errore Porta in sala: " + error.message);
      return;
    }

    onUpdated?.();
  }

  // ===== DRAG =====
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

  // ===== RESIZE =====
  async function resizeAppointmentBySlots(slotsChanged: number) {
    if (saving) return;
    setSaving(true);

    const s0 = parseLocal(appointment.start_time);
    const e0 = appointment.end_time ? parseLocal(appointment.end_time) : new Date(s0.getTime() + SLOT_MINUTES * 60_000);

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
        "rounded-2xl cursor-pointer overflow-hidden",
        "bg-[#1c0f0a]/92 backdrop-blur-md",
        "border border-[#f3d8b6]/22",
        "shadow-[0_16px_55px_rgba(0,0,0,0.55)]",
        "transition",
        isInSala
          ? "ring-2 ring-[#f3d8b6]/35 shadow-[0_0_70px_rgba(243,216,182,0.16)]"
          : "ring-1 ring-black/20",
        isDone ? "opacity-70" : "",
      ].join(" ")}
      style={{ top, height, opacity: dragging ? 0.82 : 1 }}
      drag="y"
      dragConstraints={{ top: -5000, bottom: 5000 }}
      dragElastic={0.08}
      onDragStart={() => {
        if (saving) return;
        setDragging(true);
      }}
      onDragEnd={async (_: any, info: any) => {
        setDragging(false);

        const slotsMoved = Math.round(info.delta.y / SLOT_PX);
        if (slotsMoved === 0) return;

        const newIndex = safeStartIndex + slotsMoved;
        if (newIndex < 0 || newIndex >= hours.length) return;

        await shiftAppointmentBySlots(slotsMoved);
      }}
      onClick={() => !dragging && !resizing && !saving && onClick()}
    >
      {/* accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[7px]" style={{ backgroundColor: accent }} />

      {/* background segments (multi-servizio) */}
      <div className="absolute inset-0 left-[7px] opacity-[0.18] pointer-events-none">
        <div className="h-full w-full flex flex-col">
          {normalizedSegments.map((seg, i) => {
            const ratio = (Number(seg.duration) || SLOT_MINUTES) / denom;
            const hPx = Math.max(10, Math.round(ratio * height));
            return (
              <div
                key={`${seg.name}-${i}`}
                style={{ height: hPx, backgroundColor: seg.color }}
                className="w-full"
                title={seg.name}
              />
            );
          })}
        </div>
      </div>

      {/* actions */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpenActions((v) => !v);
        }}
        className="absolute top-1.5 right-1.5 z-40 rounded-xl px-2 py-1
                   bg-black/35 border border-white/10
                   text-white/80 hover:bg-black/45 transition"
        aria-label="Azioni"
        title="Azioni"
      >
        ⋮
      </button>

      {openActions && (
        <div
          className="absolute right-2 top-9 z-50 w-44 rounded-2xl
                     bg-[#140b07] border border-[#5c3a21]/60
                     shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onPortaInSala}
            className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5"
          >
            👤 Porta in sala
          </button>
          <button className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5">
            🧪 Schede tecniche
          </button>
          <button className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5">
            💰 Vai in cassa
          </button>
        </div>
      )}

      {/* content */}
      <div className={["relative z-10 h-full pl-[14px] pr-2", compact ? "py-1.5 flex items-center" : "py-2"].join(" ")}>
        <div className="w-full">
          {/* row 1 */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                {colors.length ? (
                  colors.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      className="h-2.5 w-2.5 rounded-full border border-black/30"
                      style={{ backgroundColor: c }}
                      title="Servizio"
                    />
                  ))
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20 border border-black/30" />
                )}
              </div>

              <div className="min-w-0">
                <div className={["font-extrabold text-[#f3d8b6] leading-tight truncate", compact ? "text-[12px]" : "text-[13px]"].join(" ")}>
                  {customerName}
                </div>
              </div>
            </div>

            <span className={["shrink-0 text-[10px] font-extrabold tracking-wider px-2 py-1 rounded-xl", meta.cls].join(" ")}>
              {meta.label}
            </span>
          </div>

          {/* row 2: servizi SEMPRE visibili */}
          <div
            className={["mt-0.5 text-white/85 truncate", compact ? "text-[11px]" : "text-[12px]"].join(" ")}
            title={serviceNames.join(", ")}
          >
            {firstTwo.length ? firstTwo.join(" • ") : "Servizio"}
            {extraCount > 0 ? <span className="text-white/55">{`  +${extraCount}`}</span> : null}
            <span className="ml-2 text-white/50">{Math.round(durationMin)}m</span>
          </div>

          {!compact && appointment?.notes ? (
            <div className="mt-1 text-[11px] text-white/60 line-clamp-2">
              {String(appointment.notes)}
            </div>
          ) : null}
        </div>
      </div>

      {/* resize handle (più “prendibile”) */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-4 cursor-s-resize bg-black/30 z-20"
        drag="y"
        dragConstraints={{ top: 0, bottom: SLOT_PX * 6 }}
        dragElastic={0.05}
        onDragStart={() => {
          if (saving) return;
          setResizing(true);
        }}
        onDragEnd={async (_: any, info: any) => {
          setResizing(false);
          const slotsChanged = Math.round(info.delta.y / SLOT_PX);
          if (slotsChanged === 0) return;
          await resizeAppointmentBySlots(slotsChanged);
        }}
      />
    </motion.div>
  );
}
