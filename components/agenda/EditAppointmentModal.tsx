"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { timeFromTs } from "@/lib/appointmentTime";
import { generateHours } from "./utils";

interface Props {
  isOpen: boolean;
  close: () => void;
  appointment: any;
  selectedDay: string; // yyyy-mm-dd
  onUpdated?: () => void; // ✅ refresh grid
}

export default function EditAppointmentModal({
  isOpen,
  close,
  appointment,
  selectedDay,
  onUpdated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [customers, setCustomers] = useState<any[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const [customer, setCustomer] = useState<string>("");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [time, setTime] = useState<string>("08:00");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    void loadCustomers();
    void loadStaff();

    if (appointment) {
      setCustomer(appointment.customer_id ?? "");
      setStaffId(appointment.staff_id?.toString() ?? null);
      setNotes(appointment.notes ?? "");
      setTime(timeFromTs(appointment.start_time));
    }

    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function loadCustomers() {
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone")
      .order("first_name");

    setCustomers(data || []);
    setFilteredCustomers(data || []);
  }

  async function loadStaff() {
    const { data } = await supabase
      .from("staff")
      .select("id, name, active")
      .eq("active", true)
      .order("name");

    const available = [{ id: null, name: "Disponibile" }];
    setStaff(available.concat(data || []));
  }

  async function updateAppointment() {
    if (!appointment?.id) return;
    if (!customer || !time) return;
    if (saving) return;

    setSaving(true);

    const oldStart = new Date(appointment.start_time);
    const oldEnd = appointment.end_time
      ? new Date(appointment.end_time)
      : new Date(oldStart.getTime() + 30 * 60_000);

    const durationMs = oldEnd.getTime() - oldStart.getTime();

    const newStart = new Date(`${selectedDay}T${time}:00`);
    const newEnd = new Date(newStart.getTime() + durationMs);

    const { error } = await supabase
      .from("appointments")
      .update({
        customer_id: Number(customer),
        staff_id: staffId ? Number(staffId) : null,
        notes,
        start_time: newStart.toISOString().replace("Z", ""),
        end_time: newEnd.toISOString().replace("Z", ""),
      })
      .eq("id", appointment.id);

    if (error) {
      alert("Errore salvataggio: " + error.message);
      setSaving(false);
      return;
    }

    onUpdated?.();
    close();
  }

  async function deleteAppointment() {
    if (!appointment?.id) return;
    if (saving) return;

    setSaving(true);

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointment.id);

    if (error) {
      alert("Errore eliminazione: " + error.message);
      setSaving(false);
      return;
    }

    onUpdated?.();
    close();
  }

  async function closeAppointmentAndCreateSale() {
    if (!appointment?.id) return;
    if (saving) return;

    setSaving(true);

    const res = await fetch("/api/agenda/close-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointment_id: appointment.id }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => null);
      alert("Errore chiusura: " + (j?.error || res.statusText));
      setSaving(false);
      return;
    }

    onUpdated?.();
    close();
  }

  if (!isOpen) return null;

  const hours = generateHours("08:00", "20:00", 30);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#1c0f0a] p-8 rounded-2xl shadow-xl w-full max-w-lg border border-[#9b6b43]/30"
      >
        <h2 className="text-2xl font-semibold text-white mb-6">
          Modifica Appuntamento
        </h2>

        <input
          type="text"
          placeholder="Cerca cliente (nome o cognome)"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-3"
          disabled={saving}
          onChange={(e) => {
            const q = e.target.value.toLowerCase().trim();
            const filtered = customers.filter((c: any) => {
              const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`
                .toLowerCase()
                .trim();
              return full.includes(q);
            });
            setFilteredCustomers(filtered);
          }}
        />

        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
          value={customer}
          disabled={saving}
          onChange={(e) => setCustomer(e.target.value)}
        >
          <option value="">Seleziona Cliente</option>
          {filteredCustomers.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.first_name} {c.last_name}
            </option>
          ))}
        </select>

        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
          value={time}
          disabled={saving}
          onChange={(e) => setTime(e.target.value)}
        >
          {hours.map((h: string) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <select
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4"
          value={staffId ?? ""}
          disabled={saving}
          onChange={(e) =>
            setStaffId(e.target.value === "" ? null : e.target.value)
          }
        >
          {staff.map((s: any) => (
            <option key={s.id ?? "free"} value={s.id ?? ""}>
              {s.name}
            </option>
          ))}
        </select>

        <textarea
          placeholder="Note"
          className="w-full p-3 bg-[#3a251a] rounded-xl text-white mb-4 h-24"
          value={notes}
          disabled={saving}
          onChange={(e) => setNotes(e.target.value)}
        />

        <button
          onClick={closeAppointmentAndCreateSale}
          disabled={saving}
          className={`w-full bg-green-600 text-white p-3 rounded-xl font-semibold text-lg mb-3 ${
            saving ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          Chiudi appuntamento (crea vendita)
        </button>

        <button
          onClick={updateAppointment}
          disabled={saving}
          className={`w-full bg-[#d8a471] text-[#1c0f0a] p-3 rounded-xl font-semibold text-lg mb-3 ${
            saving ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          Salva Modifiche
        </button>

        <button
          onClick={deleteAppointment}
          disabled={saving}
          className={`w-full bg-red-700 text-white p-3 rounded-xl font-semibold text-lg mb-4 ${
            saving ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          Elimina Appuntamento
        </button>

        <button
          onClick={close}
          disabled={saving}
          className={`w-full text-white/70 text-center ${
            saving ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          Annulla
        </button>
      </motion.div>
    </div>
  );
}
