"use client";

import { motion } from "framer-motion";
import { useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  appointment: any;
  hours: string[];
  onClick: () => void;
}

export default function AppointmentBox({ appointment, hours, onClick }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const startIndex = hours.indexOf(appointment.time);
  const top = startIndex * 40; // ogni slot = 40px
  const height = (appointment.duration / 30) * 40; // durata → altezza

  const onDragStart = () => setDragging(true);
  const onDragEnd = async (_: any, info: any) => {
    setDragging(false);

    if (!boxRef.current) return;

    const deltaY = info.delta.y;
    const slotsMoved = Math.round(deltaY / 40);

    if (slotsMoved === 0) return;

    const newIndex = startIndex + slotsMoved;

    if (newIndex < 0 || newIndex >= hours.length) return;

    const newTime = hours[newIndex];

    await supabase
      .from("appointments")
      .update({ time: newTime })
      .eq("id", appointment.id);
  };

  /* ---------------- RESIZE ---------------- */

  const onResizeStart = () => setResizing(true);
  const onResizeEnd = async (_: any, info: any) => {
    setResizing(false);

    const deltaY = info.delta.y;
    const slotsChanged = Math.round(deltaY / 40);

    const newDuration = appointment.duration + slotsChanged * 30;

    if (newDuration < 30) return;

    await supabase
      .from("appointments")
      .update({ duration: newDuration })
      .eq("id", appointment.id);
  };

  return (
    <motion.div
      ref={boxRef}
      className="absolute left-1 right-1 rounded-xl shadow-lg cursor-pointer overflow-hidden"
      style={{
        top,
        height,
        backgroundColor: appointment.service_color || "#a8754f",
        border: "2px solid rgba(0,0,0,0.25)",
        opacity: dragging ? 0.7 : 1,
      }}
      drag="y"
      dragConstraints={{ top: -1000, bottom: 1000 }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => !dragging && !resizing && onClick()}
    >
      {/* CONTENUTO */}
      <div className="p-2 text-black font-semibold text-sm">
        <div>{appointment.customers?.name || "Cliente"}</div>

        {/* SERVIZI MULTIPLI */}
        {appointment.services_multi ? (
          <div className="text-xs opacity-80">
            {appointment.services_multi.map((s: any) => s.name).join(", ")}
          </div>
        ) : (
          <div className="text-xs opacity-80">
            {appointment.services?.name || "Servizio"}
          </div>
        )}

        {appointment.notes && (
          <div className="text-xs opacity-60 mt-1">{appointment.notes}</div>
        )}
      </div>

      {/* RESIZE HANDLE */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize bg-black/20"
        drag="y"
        dragConstraints={{ top: 0, bottom: 40 }}
        onDragStart={onResizeStart}
        onDragEnd={onResizeEnd}
      />
    </motion.div>
  );
}
