"use client";

import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { timeFromTs } from "@/lib/appointmentTime";

interface Props {
  appointment: any;
  hours: string[];
  onClick: () => void;
  onUpdated?: () => void; // ✅ refresh grid
}

export default function AppointmentBox({
  appointment,
  hours,
  onClick,
  onUpdated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [saving, setSaving] = useState(false);

  // ===== POSIZIONE =====
  const startTime = timeFromTs(appointment.start_time);
  const startIndex = hours.indexOf(startTime);
  const top = Math.max(0, startIndex) * 40;

  // ===== DURATA =====
  const durationMin = appointment.end_time
    ? (new Date(appointment.end_time).getTime() -
        new Date(appointment.start_time).getTime()) / 60000
    : 30;

  const height = (durationMin / 30) * 40;

  // ===== COLORE =====
  const color =
    appointment?.appointment_services?.[0]?.service?.color_code || "#a8754f";

  // ===== DATI UI =====
  const customerName = appointment.customers
    ? `${appointment.customers.first_name} ${appointment.customers.last_name}`.trim()
    : "Cliente";

  const services =
    (appointment.appointment_services || [])
      .map((r: any) => r.service?.name)
      .filter(Boolean)
      .join(", ") || "Servizi";

  // ===== DRAG (spostamento) =====
  async function shiftAppointmentBySlots(slotsMoved: number) {
    if (saving) return;
    setSaving(true);

    const start = new Date(appointment.start_time);
    const end = appointment.end_time ? new Date(appointment.end_time) : null;

    const deltaMin = slotsMoved * 30;

    const newStart = new Date(start.getTime() + deltaMin * 60_000);
    const newEnd = end ? new Date(end.getTime() + deltaMin * 60_000) : null;

    const { error } = await supabase
      .from("appointments")
      .update({
        start_time: newStart.toISOString().replace("Z", ""),
        ...(newEnd ? { end_time: newEnd.toISOString().replace("Z", "") } : {}),
      })
      .eq("id", appointment.id);

    if (error) {
      alert("Errore spostamento: " + error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onUpdated?.();
  }

  // ===== RESIZE (durata) =====
  async function resizeAppointmentBySlots(slotsChanged: number) {
    if (saving) return;
    setSaving(true);

    const start = new Date(appointment.start_time);
    const end = appointment.end_time
      ? new Date(appointment.end_time)
      : new Date(start.getTime() + 30 * 60_000);

    const currentDuration = (end.getTime() - start.getTime()) / 60000;
    const newDuration = currentDuration + slotsChanged * 30;

    if (newDuration < 30) {
      setSaving(false);
      return;
    }

    const newEnd = new Date(start.getTime() + newDuration * 60_000);

    const { error } = await supabase
      .from("appointments")
      .update({
        end_time: newEnd.toISOString().replace("Z", ""),
      })
      .eq("id", appointment.id);

    if (error) {
      alert("Errore resize: " + error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onUpdated?.();
  }

  return (
    <motion.div
      ref={boxRef}
      className="absolute left-1 right-1 rounded-xl shadow-lg cursor-pointer overflow-hidden"
      style={{
        top,
        height,
        backgroundColor: color,
        border: "2px solid rgba(0,0,0,0.25)",
        opacity: dragging ? 0.7 : 1,
      }}
      drag="y"
      dragConstraints={{ top: -1000, bottom: 1000 }}
      onDragStart={() => {
        if (saving) return;
        setDragging(true);
      }}
      onDragEnd={async (_: any, info: any) => {
        setDragging(false);
        if (!boxRef.current) return;

        const slotsMoved = Math.round(info.delta.y / 40);
        if (slotsMoved === 0) return;

        const newIndex = startIndex + slotsMoved;
        if (newIndex < 0 || newIndex >= hours.length) return;

        await shiftAppointmentBySlots(slotsMoved);
      }}
      onClick={() => !dragging && !resizing && !saving && onClick()}
    >
      <div className="p-2 text-black font-semibold text-sm">
        <div>{customerName}</div>
        <div className="text-xs opacity-80">{services}</div>
        {appointment.notes && (
          <div className="text-xs opacity-60 mt-1">{appointment.notes}</div>
        )}
      </div>

      <motion.div
        className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize bg-black/20"
        drag="y"
        dragConstraints={{ top: 0, bottom: 40 }}
        onDragStart={() => {
          if (saving) return;
          setResizing(true);
        }}
        onDragEnd={async (_: any, info: any) => {
          setResizing(false);
          const slotsChanged = Math.round(info.delta.y / 40);
          if (slotsChanged === 0) return;
          await resizeAppointmentBySlots(slotsChanged);
        }}
      />
    </motion.div>
  );
}
